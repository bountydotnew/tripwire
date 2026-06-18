import { and, eq, sql, asc } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import {
  repositories,
  ruleConfigs,
  ruleThresholdCounters,
  whitelistEntries,
  blacklistEntries,
  globalVouches,
  customRules,
  DEFAULT_RULE_CONFIG,
  type RuleConfig,
  type RuleAction,
  type EventContentType,
} from "@tripwire/db"
import {
  getInstallationToken,
  closePullRequest,
  closeIssue,
  deleteComment,
  addComment,
  getUser,
  getMergedPrCount,
  countUserPrsToday,
  getPrFilesCount,
  getUserPublicRepoCount,
  hasProfileReadme,
  getCollaboratorPermission,
} from "@tripwire/github"
import { env } from "@tripwire/env/server"
import { logEvent, logEvents } from "./events"
import { evaluateCustomRule } from "./rules/custom-rule-evaluator"
import { resolveSignals } from "./rules/signal-resolver"
import { renderBlockedComment, renderWarnedComment } from "./pr-comment"
import { loadPrefsForInstallation } from "./pr-comment-loader"

const APP_BASE_URL = env.BETTER_AUTH_URL ?? ""

// ─── Scope helper ──────────────────────────────────────────────

type ScopeKey = "pullRequests" | "issues" | "comments"

function contentTypeToScopeKey(
  t: EventContentType | undefined
): ScopeKey | null {
  if (t === "pull_request") return "pullRequests"
  if (t === "issue") return "issues"
  if (t === "comment") return "comments"
  return null
}

interface RuleWithScope {
  enabled: boolean
  scopeOverride?: {
    pullRequests?: boolean
    issues?: boolean
    comments?: boolean
  }
}

/**
 * Returns true if a rule should run for the given content type.
 * - rule.enabled must be true.
 * - rule.scopeOverride[key], if set, wins over the repo-wide scope.
 * - When contentType is unknown (legacy webhook path), the rule runs.
 */
function ruleApplies(
  rule: RuleWithScope,
  contentType: EventContentType | undefined,
  scope: { pullRequests: boolean; issues: boolean; comments: boolean }
): boolean {
  if (!rule.enabled) return false
  const key = contentTypeToScopeKey(contentType)
  if (!key) return true
  const override = rule.scopeOverride?.[key]
  if (override !== undefined) return override
  return scope[key]
}

// ─── Types ─────────────────────────────────────────────────────

export interface WebhookContext {
  installationId: number
  repoFullName: string // "owner/repo"
  githubRepoId: number
  senderLogin: string
  senderId: number
  prNumber?: number // For PR-specific rules like maxFilesChanged
}

export interface RuleEvaluation {
  rule: string
  passed: boolean
  nearMiss: boolean
  reason?: string
  /** The configured action for this rule */
  action?: RuleAction
  /** The actual value measured (for numeric rules) */
  actual?: number
  /** The configured threshold/limit (for numeric rules) */
  threshold?: number
}

export interface PipelineResult {
  /** Whether the content was allowed through */
  allowed: boolean
  /** How the pipeline resolved */
  outcome:
    | "allowed"
    | "blocked"
    | "warned"
    | "logged"
    | "whitelist_bypass"
    | "blacklist_blocked"
    | "repo_not_found"
    | "unable_to_verify"
  /** The rule that blocked/warned (if any) */
  blockingRule?: string
  /** Human-readable reason */
  blockReason?: string
  /** The action to take based on the first failing rule */
  resolvedAction?: RuleAction
  /** Detailed evaluation of each rule that was checked */
  evaluations: RuleEvaluation[]
  /** Number of enabled rules that were checked */
  rulesChecked: number
  /** Internal repo ID (for event logging) */
  repoId?: string
}

/** Default count if a rule's `thresholdCount` is unset. */
const DEFAULT_THRESHOLD_COUNT = 3

/**
 * Upsert the per-(repo, user, rule) violation counter and return the new count.
 * Caller decides whether `count >= thresholdCount` means a block.
 */
async function recordThresholdViolation(
  repoId: string,
  githubUserId: number,
  ruleName: string
): Promise<number> {
  const [row] = await db
    .insert(ruleThresholdCounters)
    .values({
      repoId,
      githubUserId,
      ruleName,
      count: 1,
    })
    .onConflictDoUpdate({
      target: [
        ruleThresholdCounters.repoId,
        ruleThresholdCounters.githubUserId,
        ruleThresholdCounters.ruleName,
      ],
      set: {
        count: sql`${ruleThresholdCounters.count} + 1`,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      },
    })
    .returning({ count: ruleThresholdCounters.count })

  return row?.count ?? 1
}

/**
 * Map an action+block-status to a final pipeline outcome.
 * - "block" + blocked → "blocked"
 * - "threshold" + blocked → caller must consult counter; this helper just maps
 *   based on the final `blocked` flag passed in.
 * - "warn" + blocked → "warned"
 * - "log" + blocked → "logged"
 */
function resolveOutcome(
  action: RuleAction,
  blocked: boolean
): PipelineResult["outcome"] {
  if (!blocked) return "allowed"
  if (action === "block" || action === "threshold") return "blocked"
  if (action === "warn") return "warned"
  return "logged"
}

// ─── Near-miss threshold ───────────────────────────────────────
// A user is "near miss" if their value is within 20% of triggering.
const NEAR_MISS_RATIO = 0.2

function isNearMissMin(actual: number, threshold: number): boolean {
  // For "minimum" rules: user passed but is close to failing
  // e.g., accountAge: required 30 days, account is 35 days → within 20%
  if (actual < threshold) return false // already blocked, not a near-miss
  return actual < threshold * (1 + NEAR_MISS_RATIO)
}

function isNearMissMax(actual: number, limit: number): boolean {
  // For "maximum" rules: user passed but is close to hitting the limit
  // e.g., maxPrsPerDay: limit 5, user has 4 → within 20%
  if (actual >= limit) return false // already blocked
  return actual >= limit * (1 - NEAR_MISS_RATIO)
}

// ─── Content analysis helpers ──────────────────────────────────

/**
 * Detect the dominant script/language of text using Unicode code-point ranges.
 */

interface LanguageDetectionResult {
  dominant: string
  confidence: number
  counts: Record<string, number>
}

/** Strip noise that skews language detection. */
function cleanForLanguageDetection(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`]+`/g, "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[a-zA-Z_$][a-zA-Z0-9_$.]*\(/g, "")
    .replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, "")
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, "")
    .replace(/#\S+/g, "")
    .replace(/@\S+/g, "")
}

function detectLanguageScript(text: string): LanguageDetectionResult {
  const cleaned = cleanForLanguageDetection(text)
  const counts: Record<string, number> = {
    latin: 0,
    cjk: 0,
    cyrillic: 0,
    arabic: 0,
    devanagari: 0,
    hangul: 0,
    kana: 0,
  }

  for (const char of cleaned) {
    const code = char.codePointAt(0)!
    if (
      (code >= 0x41 && code <= 0x5a) ||
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0xc0 && code <= 0x24f)
    ) {
      counts.latin++
    } else if (code >= 0x4e00 && code <= 0x9fff) {
      counts.cjk++
    } else if (code >= 0x0400 && code <= 0x04ff) {
      counts.cyrillic++
    } else if (code >= 0x0600 && code <= 0x06ff) {
      counts.arabic++
    } else if (code >= 0x0900 && code <= 0x097f) {
      counts.devanagari++
    } else if (code >= 0xac00 && code <= 0xd7af) {
      counts.hangul++
    } else if (
      (code >= 0x3040 && code <= 0x309f) ||
      (code >= 0x30a0 && code <= 0x30ff)
    ) {
      counts.kana++
    }
  }

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  if (total === 0) return { dominant: "unknown", confidence: 0, counts }

  let dominant = "unknown"
  let maxCount = 0
  for (const [script, count] of Object.entries(counts)) {
    if (count > maxCount) {
      maxCount = count
      dominant = script
    }
  }

  const SCRIPT_LANGUAGES: Record<string, string> = {
    latin: "english",
    cjk: "chinese",
    cyrillic: "russian",
    arabic: "arabic",
    devanagari: "hindi",
    hangul: "korean",
    kana: "japanese",
  }
  dominant = SCRIPT_LANGUAGES[dominant] ?? dominant

  return { dominant, confidence: maxCount / total, counts }
}

const ENGLISH_MARKERS = [
  "the",
  "is",
  "are",
  "was",
  "were",
  "have",
  "has",
  "been",
  "will",
  "would",
  "could",
  "should",
  "this",
  "that",
  "with",
  "from",
  "for",
  "not",
  "but",
  "and",
  "you",
  "your",
]

function isLikelyLanguage(text: string, language: string): boolean {
  const cleaned = cleanForLanguageDetection(text)
  const words = cleaned.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length < 5) return true

  const detection = detectLanguageScript(cleaned)
  if (detection.dominant === "unknown") return true

  const lang = language.toLowerCase()

  if (lang === "english") {
    if (detection.dominant !== "english" && detection.confidence > 0.5)
      return false
    const englishWordCount = words.filter((w) =>
      ENGLISH_MARKERS.includes(w)
    ).length
    const ratio = englishWordCount / words.length
    return ratio >= 0.03
  }

  const LANG_SCRIPTS: Record<string, string> = {
    chinese: "chinese",
    japanese: "japanese",
    korean: "korean",
    russian: "russian",
    arabic: "arabic",
    hindi: "hindi",
  }
  const expected = LANG_SCRIPTS[lang]
  if (!expected) return true

  return detection.dominant === expected && detection.confidence > 0.3
}

// ─── Crypto address detection ──────────────────────────────────

const CRYPTO_PATTERNS: { name: string; pattern: RegExp }[] = [
  // Bitcoin (legacy P2PKH/P2SH + SegWit bech32)
  { name: "Bitcoin", pattern: /\b(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}\b/ },
  // Ethereum (0x + 40 hex chars)
  { name: "Ethereum", pattern: /\b0x[a-fA-F0-9]{40}\b/ },
  // Solana (44 base58 chars)
  { name: "Solana", pattern: /\b[1-9A-HJ-NP-Za-km-z]{44}\b/ },
  // Monero (starts with 4, 95 chars total)
  { name: "Monero", pattern: /\b4[0-9AB][1-9A-HJ-NP-Za-km-z]{93}\b/ },
  // Dash (starts with X, 34 chars total)
  { name: "Dash", pattern: /\bX[1-9A-HJ-NP-Za-km-z]{33}\b/ },
]

/**
 * Scan text for cryptocurrency wallet addresses.
 * Returns the first match found, or null if clean.
 */
function detectCryptoAddress(
  text: string
): { crypto: string; address: string } | null {
  for (const { name, pattern } of CRYPTO_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      return { crypto: name, address: match[0] }
    }
  }
  return null
}

// ─── Pipeline ──────────────────────────────────────────────────

/**
 * Run all enabled rules against a GitHub user, collecting detailed
 * evaluation results for every rule — including near-miss detection.
 *
 * Returns a PipelineResult with the outcome and per-rule evaluations.
 */
export async function runFilterPipeline(
  ctx: WebhookContext,
  contentText?: string,
  contentType?: EventContentType
): Promise<PipelineResult> {
  const evaluations: RuleEvaluation[] = []
  let rulesChecked = 0

  // 1. Look up the repo in our DB
  const [repo] = await db
    .select()
    .from(repositories)
    .where(eq(repositories.githubRepoId, ctx.githubRepoId))

  if (!repo) {
    return {
      allowed: true,
      outcome: "repo_not_found",
      evaluations,
      rulesChecked,
    }
  }

  // 2. Auto-bypass: repo owner, admins, and collaborators with push access
  const [repoOwner] = ctx.repoFullName.split("/")
  if (repoOwner.toLowerCase() === ctx.senderLogin.toLowerCase()) {
    return {
      allowed: true,
      outcome: "whitelist_bypass",
      evaluations,
      rulesChecked,
      repoId: repo.id,
    }
  }

  // Check if sender has push/admin/maintain access (collaborator)
  try {
    const earlyToken = await getInstallationToken(ctx.installationId)
    const permResult = await getCollaboratorPermission(
      earlyToken,
      ctx.repoFullName,
      ctx.senderLogin
    )
    if (
      permResult === "admin" ||
      permResult === "write" ||
      permResult === "maintain"
    ) {
      return {
        allowed: true,
        outcome: "whitelist_bypass",
        evaluations,
        rulesChecked,
        repoId: repo.id,
      }
    }
  } catch {
    // permission check failed, continue to whitelist/blacklist checks
  }

  // 3. Check whitelist (id-first to dodge GitHub username changes; fall back
  // to case-insensitive username for legacy rows without a userId).
  const whitelistAll = await db
    .select()
    .from(whitelistEntries)
    .where(eq(whitelistEntries.repoId, repo.id))

  const senderLoginLower = ctx.senderLogin.toLowerCase()
  if (
    whitelistAll.some((w) =>
      w.githubUserId != null
        ? w.githubUserId === ctx.senderId
        : w.githubUsername.toLowerCase() === senderLoginLower
    )
  ) {
    return {
      allowed: true,
      outcome: "whitelist_bypass",
      evaluations,
      rulesChecked,
      repoId: repo.id,
    }
  }

  // 3. Check blacklist (id-first, then case-insensitive username fallback).
  const blacklistAll = await db
    .select()
    .from(blacklistEntries)
    .where(eq(blacklistEntries.repoId, repo.id))

  if (
    blacklistAll.some((b) =>
      b.githubUserId != null
        ? b.githubUserId === ctx.senderId
        : b.githubUsername.toLowerCase() === senderLoginLower
    )
  ) {
    return {
      allowed: false,
      outcome: "blacklist_blocked",
      blockingRule: "blacklist",
      blockReason: `@${ctx.senderLogin} is blacklisted from this repository.`,
      evaluations,
      rulesChecked,
      repoId: repo.id,
    }
  }

  // 4. Load rule config
  const [configRow] = await db
    .select()
    .from(ruleConfigs)
    .where(eq(ruleConfigs.repoId, repo.id))

  // 4a. Content-scope is per-rule now. The repo-wide scope is the default
  // each rule inherits; rule.scopeOverride wins when set. See ruleApplies().
  const scope = {
    ...DEFAULT_RULE_CONFIG.contentScope,
    ...configRow?.config?.contentScope,
  }

  const rawConfig = configRow?.config
  const config: RuleConfig = {
    languageRequirement: {
      ...DEFAULT_RULE_CONFIG.languageRequirement,
      ...rawConfig?.languageRequirement,
    },
    minMergedPrs: {
      ...DEFAULT_RULE_CONFIG.minMergedPrs,
      ...rawConfig?.minMergedPrs,
    },
    accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...rawConfig?.accountAge },
    maxPrsPerDay: {
      ...DEFAULT_RULE_CONFIG.maxPrsPerDay,
      ...rawConfig?.maxPrsPerDay,
    },
    maxFilesChanged: {
      ...DEFAULT_RULE_CONFIG.maxFilesChanged,
      ...rawConfig?.maxFilesChanged,
    },
    repoActivityMinimum: {
      ...DEFAULT_RULE_CONFIG.repoActivityMinimum,
      ...rawConfig?.repoActivityMinimum,
    },
    requireProfileReadme: {
      ...DEFAULT_RULE_CONFIG.requireProfileReadme,
      ...rawConfig?.requireProfileReadme,
    },
    cryptoAddressDetection: {
      ...DEFAULT_RULE_CONFIG.cryptoAddressDetection,
      ...rawConfig?.cryptoAddressDetection,
    },
    vouchedUsersOnly: {
      ...DEFAULT_RULE_CONFIG.vouchedUsersOnly,
      ...rawConfig?.vouchedUsersOnly,
    },
    aiHoneypot: { ...DEFAULT_RULE_CONFIG.aiHoneypot, ...rawConfig?.aiHoneypot },
    autoWhitelistGlobalVouches: {
      ...DEFAULT_RULE_CONFIG.autoWhitelistGlobalVouches,
      ...rawConfig?.autoWhitelistGlobalVouches,
    },
    contentScope: scope,
    repoFiles: {
      rulesMd: {
        ...DEFAULT_RULE_CONFIG.repoFiles.rulesMd,
        ...rawConfig?.repoFiles?.rulesMd,
      },
      prTemplate: {
        ...DEFAULT_RULE_CONFIG.repoFiles.prTemplate,
        ...rawConfig?.repoFiles?.prTemplate,
      },
      agentsMd: {
        ...DEFAULT_RULE_CONFIG.repoFiles.agentsMd,
        ...rawConfig?.repoFiles?.agentsMd,
      },
    },
  }
  // Combine honeypot phrases from both PR template and AGENTS.md
  const honeypotPhrases = [
    ...config.repoFiles.prTemplate.honeypotPhrases,
    ...config.repoFiles.agentsMd.honeypotPhrases,
  ]

  // ─── autoWhitelistGlobalVouches ───────────────────────────
  if (config.autoWhitelistGlobalVouches.enabled) {
    const minVouches = config.autoWhitelistGlobalVouches.minVouches
    const vouchRows = await db
      .select()
      .from(globalVouches)
      .where(sql`lower(${globalVouches.githubUsername}) = ${senderLoginLower}`)

    if (vouchRows.length >= minVouches) {
      await db
        .insert(whitelistEntries)
        .values({
          repoId: repo.id,
          githubUsername: ctx.senderLogin,
          githubUserId: ctx.senderId,
        })
        .onConflictDoNothing()

      return {
        allowed: true,
        outcome: "whitelist_bypass",
        evaluations,
        rulesChecked,
        repoId: repo.id,
      }
    }
  }

  // ─── vouchedUsersOnly ──────────────────────────────────────
  // Non-vouched users are rejected before any per-user GitHub lookups.
  // Whitelisted users already returned above (covers "repo" scope).
  // When vouchScope is "global" or "both", also check global vouches.
  if (ruleApplies(config.vouchedUsersOnly, contentType, scope)) {
    rulesChecked++
    const vouchScope = config.vouchedUsersOnly.vouchScope ?? "repo"

    // If scope includes global vouches, check if user is globally vouched
    let isGloballyVouched = false
    if (vouchScope === "global" || vouchScope === "both") {
      const vouchRows = await db
        .select()
        .from(globalVouches)
        .where(
          sql`lower(${globalVouches.githubUsername}) = ${senderLoginLower}`
        )
      isGloballyVouched = vouchRows.length > 0
    }

    // For "repo" scope, the whitelist check above already handled it —
    // if we're here, the user wasn't whitelisted, so they fail.
    // For "global", pass if globally vouched.
    // For "both", pass if globally vouched (whitelist already checked above).
    const passed = isGloballyVouched

    if (passed) {
      evaluations.push({
        rule: "vouchedUsersOnly",
        passed: true,
        nearMiss: false,
      })
    } else {
      const reason =
        vouchScope === "global"
          ? `@${ctx.senderLogin} is not a globally vouched contributor.`
          : `@${ctx.senderLogin} is not a vouched contributor for this repository.`
      evaluations.push({
        rule: "vouchedUsersOnly",
        passed: false,
        nearMiss: false,
        reason,
      })
      const action = config.vouchedUsersOnly.action
      let outcome: PipelineResult["outcome"]
      if (action === "threshold") {
        const thresholdCount =
          config.vouchedUsersOnly.thresholdCount ?? DEFAULT_THRESHOLD_COUNT
        const newCount = await recordThresholdViolation(
          repo.id,
          ctx.senderId,
          "vouchedUsersOnly"
        )
        outcome = newCount >= thresholdCount ? "blocked" : "warned"
      } else {
        outcome = resolveOutcome(action, true)
      }
      const allowed = outcome !== "blocked"
      return {
        allowed,
        outcome,
        blockingRule: "vouchedUsersOnly",
        blockReason: reason,
        resolvedAction: action,
        evaluations,
        rulesChecked,
        repoId: repo.id,
      }
    }
  }

  const token = await getInstallationToken(ctx.installationId)

  // Fetch user once for rules that need it
  let ghUser: Record<string, unknown> | null = null
  const needsUser = config.accountAge.enabled
  if (needsUser) {
    try {
      ghUser = await getUser(token, ctx.senderLogin)
    } catch {
      // If we can't fetch user info, skip user-dependent rules
    }
  }

  // Helper: as rules trip we resolve their outcome immediately (and bump
  // any threshold counters), then keep the most-severe trip to surface.
  type Violation = {
    rule: string
    reason: string
    action: RuleAction
    outcome: "blocked" | "warned" | "logged"
  }
  let firstViolation: Violation | null = null

  const SEVERITY: Record<Violation["outcome"], number> = {
    blocked: 3,
    warned: 2,
    logged: 1,
  }

  async function recordViolation(
    ruleName: string,
    reason: string,
    action: RuleAction,
    thresholdCount?: number
  ): Promise<Violation> {
    let outcome: Violation["outcome"]
    if (action === "threshold") {
      const limit = thresholdCount ?? DEFAULT_THRESHOLD_COUNT
      const newCount = await recordThresholdViolation(
        repo.id,
        ctx.senderId,
        ruleName
      )
      outcome = newCount >= limit ? "blocked" : "warned"
    } else if (action === "block") {
      outcome = "blocked"
    } else if (action === "warn") {
      outcome = "warned"
    } else {
      outcome = "logged"
    }
    const v: Violation = { rule: ruleName, reason, action, outcome }
    if (
      !firstViolation ||
      SEVERITY[outcome] > SEVERITY[firstViolation.outcome]
    ) {
      firstViolation = v
    }
    return v
  }

  /**
   * Decide what to do when a GitHub lookup fails. For block/threshold rules
   * we must NOT silently fall through — treat the failure as an
   * "unable to verify" warning. For warn/log rules we fail open but log a
   * lookup_failed evaluation so it's visible in the trail.
   */
  async function recordLookupFailure(
    ruleName: string,
    action: RuleAction,
    err: unknown
  ) {
    const message = err instanceof Error ? err.message : "unknown error"
    evaluations.push({
      rule: ruleName,
      passed: false,
      nearMiss: false,
      action,
      reason: `Unable to verify ${ruleName} for @${ctx.senderLogin}: ${message}`,
    })
    if (action === "block" || action === "threshold") {
      const reason = `Tripwire could not verify ${ruleName} for @${ctx.senderLogin}; holding for review.`
      const v: Violation = {
        rule: ruleName,
        reason,
        action,
        outcome: "warned",
      }
      if (
        !firstViolation ||
        SEVERITY[v.outcome] > SEVERITY[firstViolation.outcome]
      ) {
        firstViolation = v
      }
    }
  }

  // ─── accountAge ────────────────────────────────────────────
  if (ruleApplies(config.accountAge, contentType, scope) && ghUser) {
    rulesChecked++
    const createdAt = new Date(ghUser.created_at as string)
    const ageInDays = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    )
    const threshold = config.accountAge.days
    const blocked = ageInDays < threshold

    const eval_: RuleEvaluation = {
      rule: "accountAge",
      passed: !blocked,
      nearMiss: !blocked && isNearMissMin(ageInDays, threshold),
      actual: ageInDays,
      threshold,
      reason: blocked
        ? `Account @${ctx.senderLogin} is ${ageInDays} days old (minimum: ${threshold} days).`
        : undefined,
    }
    evaluations.push(eval_)

    if (blocked) {
      await recordViolation(
        eval_.rule,
        eval_.reason!,
        config.accountAge.action,
        config.accountAge.thresholdCount
      )
    }
  }

  // ─── minMergedPrs ──────────────────────────────────────────
  if (ruleApplies(config.minMergedPrs, contentType, scope)) {
    rulesChecked++
    try {
      const count = await getMergedPrCount(token, ctx.senderLogin)
      const threshold = config.minMergedPrs.count
      const blocked = count < threshold

      const eval_: RuleEvaluation = {
        rule: "minMergedPrs",
        passed: !blocked,
        nearMiss: !blocked && isNearMissMin(count, threshold),
        actual: count,
        threshold,
        reason: blocked
          ? `@${ctx.senderLogin} has ${count} merged PRs (minimum: ${threshold}).`
          : undefined,
      }
      evaluations.push(eval_)

      if (blocked) {
        await recordViolation(
          eval_.rule,
          eval_.reason!,
          config.minMergedPrs.action,
          config.minMergedPrs.thresholdCount
        )
      }
    } catch (err) {
      await recordLookupFailure("minMergedPrs", config.minMergedPrs.action, err)
    }
  }

  // ─── languageRequirement ───────────────────────────────────
  if (
    ruleApplies(config.languageRequirement, contentType, scope) &&
    contentText &&
    contentText.length > 20
  ) {
    rulesChecked++
    const requiredLang = config.languageRequirement.language.toLowerCase()
    const passed = isLikelyLanguage(contentText, requiredLang)

    const eval_: RuleEvaluation = {
      rule: "languageRequirement",
      passed,
      nearMiss: false, // binary check, no near-miss
      reason: !passed
        ? `Content from @${ctx.senderLogin} does not appear to be in ${config.languageRequirement.language}.`
        : undefined,
    }
    evaluations.push(eval_)

    if (!passed) {
      await recordViolation(
        eval_.rule,
        eval_.reason!,
        config.languageRequirement.action,
        config.languageRequirement.thresholdCount
      )
    }
  }

  // ─── maxPrsPerDay ──────────────────────────────────────────
  if (ruleApplies(config.maxPrsPerDay, contentType, scope)) {
    rulesChecked++
    try {
      const count = await countUserPrsToday(
        token,
        ctx.senderLogin,
        ctx.repoFullName
      )
      const limit = config.maxPrsPerDay.limit
      const blocked = count >= limit

      const eval_: RuleEvaluation = {
        rule: "maxPrsPerDay",
        passed: !blocked,
        nearMiss: !blocked && isNearMissMax(count, limit),
        actual: count,
        threshold: limit,
        reason: blocked
          ? `@${ctx.senderLogin} has already opened ${count} PRs today (limit: ${limit}).`
          : undefined,
      }
      evaluations.push(eval_)

      if (blocked) {
        await recordViolation(
          eval_.rule,
          eval_.reason!,
          config.maxPrsPerDay.action,
          config.maxPrsPerDay.thresholdCount
        )
      }
    } catch (err) {
      await recordLookupFailure("maxPrsPerDay", config.maxPrsPerDay.action, err)
    }
  }

  // ─── maxFilesChanged ───────────────────────────────────────
  if (ruleApplies(config.maxFilesChanged, contentType, scope) && ctx.prNumber) {
    rulesChecked++
    try {
      const [owner, repoName] = ctx.repoFullName.split("/")
      const filesCount = await getPrFilesCount(
        token,
        owner,
        repoName,
        ctx.prNumber
      )
      const limit = config.maxFilesChanged.limit
      const blocked = filesCount > limit

      const eval_: RuleEvaluation = {
        rule: "maxFilesChanged",
        passed: !blocked,
        nearMiss: !blocked && isNearMissMax(filesCount, limit),
        actual: filesCount,
        threshold: limit,
        reason: blocked
          ? `This PR changes ${filesCount} files (limit: ${limit}).`
          : undefined,
      }
      evaluations.push(eval_)

      if (blocked) {
        await recordViolation(
          eval_.rule,
          eval_.reason!,
          config.maxFilesChanged.action,
          config.maxFilesChanged.thresholdCount
        )
      }
    } catch (err) {
      await recordLookupFailure(
        "maxFilesChanged",
        config.maxFilesChanged.action,
        err
      )
    }
  }

  // ─── repoActivityMinimum ───────────────────────────────────
  if (ruleApplies(config.repoActivityMinimum, contentType, scope)) {
    rulesChecked++
    try {
      const repoCount = await getUserPublicRepoCount(token, ctx.senderLogin)
      const threshold = config.repoActivityMinimum.minRepos
      const blocked = repoCount < threshold

      const eval_: RuleEvaluation = {
        rule: "repoActivityMinimum",
        passed: !blocked,
        nearMiss: !blocked && isNearMissMin(repoCount, threshold),
        actual: repoCount,
        threshold,
        reason: blocked
          ? `@${ctx.senderLogin} has ${repoCount} public repos (minimum: ${threshold}).`
          : undefined,
      }
      evaluations.push(eval_)

      if (blocked) {
        await recordViolation(
          eval_.rule,
          eval_.reason!,
          config.repoActivityMinimum.action,
          config.repoActivityMinimum.thresholdCount
        )
      }
    } catch (err) {
      await recordLookupFailure(
        "repoActivityMinimum",
        config.repoActivityMinimum.action,
        err
      )
    }
  }

  // ─── requireProfileReadme ──────────────────────────────────
  if (ruleApplies(config.requireProfileReadme, contentType, scope)) {
    rulesChecked++
    try {
      const hasReadme = await hasProfileReadme(token, ctx.senderLogin)

      const eval_: RuleEvaluation = {
        rule: "requireProfileReadme",
        passed: hasReadme,
        nearMiss: false, // binary check
        reason: !hasReadme
          ? `@${ctx.senderLogin} does not have a profile README.`
          : undefined,
      }
      evaluations.push(eval_)

      if (!hasReadme) {
        await recordViolation(
          eval_.rule,
          eval_.reason!,
          config.requireProfileReadme.action,
          config.requireProfileReadme.thresholdCount
        )
      }
    } catch (err) {
      await recordLookupFailure(
        "requireProfileReadme",
        config.requireProfileReadme.action,
        err
      )
    }
  }

  // ─── aiHoneypot ────────────────────────────────────────────
  // Detect content containing any of the per-repo honeypot phrases
  // injected into the PR template. Real humans won't write them; AI
  // agents reading the template often will.
  if (
    ruleApplies(config.aiHoneypot, contentType, scope) &&
    contentText &&
    honeypotPhrases.length > 0
  ) {
    rulesChecked++
    const haystack = contentText.toLowerCase()
    const hit = honeypotPhrases.find((p) =>
      haystack.includes(p.phrase.toLowerCase())
    )
    const tripped = !!hit
    const eval_: RuleEvaluation = {
      rule: "aiHoneypot",
      passed: !tripped,
      nearMiss: false,
      action: config.aiHoneypot.action,
      reason: tripped
        ? `Content from @${ctx.senderLogin} contains the honeypot phrase (likely AI-generated).`
        : undefined,
    }
    evaluations.push(eval_)
    if (tripped) {
      await recordViolation(
        eval_.rule,
        eval_.reason!,
        config.aiHoneypot.action,
        config.aiHoneypot.thresholdCount
      )
    }
  }

  // ─── cryptoAddressDetection ────────────────────────────────
  if (
    ruleApplies(config.cryptoAddressDetection, contentType, scope) &&
    contentText
  ) {
    rulesChecked++
    const cryptoMatch = detectCryptoAddress(contentText)
    const blocked = cryptoMatch !== null

    const eval_: RuleEvaluation = {
      rule: "cryptoAddressDetection",
      passed: !blocked,
      nearMiss: false, // binary check
      action: config.cryptoAddressDetection.action,
      reason: blocked
        ? `Content from @${ctx.senderLogin} contains a ${cryptoMatch!.crypto} address: ${cryptoMatch!.address.substring(0, 12)}...`
        : undefined,
    }
    evaluations.push(eval_)

    if (blocked) {
      await recordViolation(
        eval_.rule,
        eval_.reason!,
        config.cryptoAddressDetection.action,
        config.cryptoAddressDetection.thresholdCount
      )
    }
  }

  const enabledCustomRules = await db
    .select()
    .from(customRules)
    .where(and(eq(customRules.repoId, repo.id), eq(customRules.enabled, true)))
    .orderBy(asc(customRules.priority))

  if (enabledCustomRules.length > 0) {
    if (!ghUser) {
      try {
        ghUser = await getUser(token, ctx.senderLogin)
      } catch {
        // If we can't fetch user info, proceed with null
      }
    }

    const signals = resolveSignals(
      {
        senderLogin: ctx.senderLogin,
        senderId: ctx.senderId,
        prNumber: ctx.prNumber,
      },
      ghUser,
      contentText,
      null
    )

    for (const customRule of enabledCustomRules) {
      const ruleConfig = {
        enabled: true,
        scopeOverride: customRule.scopeOverride ?? undefined,
      }

      if (!ruleApplies(ruleConfig, contentType, scope)) continue

      rulesChecked++
      const result = evaluateCustomRule(customRule.definition, signals)
      const ruleName = `custom:${customRule.name}`

      const eval_: RuleEvaluation = {
        rule: ruleName,
        passed: result.passed,
        nearMiss: result.nearMiss,
        action: customRule.action as RuleAction,
        reason: !result.passed
          ? `Custom rule "${customRule.name}" failed for @${ctx.senderLogin}.`
          : undefined,
      }
      evaluations.push(eval_)

      if (!result.passed) {
        await recordViolation(
          ruleName,
          eval_.reason!,
          customRule.action as RuleAction,
          customRule.thresholdCount ?? undefined
        )
      }
    }
  }

  // Result
  if (firstViolation) {
    const v = firstViolation as Violation
    return {
      allowed: v.outcome !== "blocked",
      outcome: v.outcome,
      blockingRule: v.rule,
      blockReason: v.reason,
      resolvedAction: v.action,
      evaluations,
      rulesChecked,
      repoId: repo.id,
    }
  }

  return {
    allowed: true,
    outcome: "allowed",
    evaluations,
    rulesChecked,
    repoId: repo.id,
  }
}

// ─── Pipeline event logging ────────────────────────────────────

/**
 * Generate a unique pipeline ID for grouping events from the same evaluation.
 */
function generatePipelineId(): string {
  return crypto.randomUUID()
}

/**
 * Log all events from a pipeline result — the outcome event plus
 * any near-miss warnings.
 */
async function logPipelineEvents(
  result: PipelineResult,
  ctx: WebhookContext,
  contentType: EventContentType,
  githubRef: string,
  extraMetadata?: Record<string, unknown>
) {
  if (!result.repoId) return

  const pipelineId = generatePipelineId()
  const baseEvent = {
    repoId: result.repoId,
    pipelineId,
    contentType,
    targetGithubUsername: ctx.senderLogin,
    targetGithubUserId: ctx.senderId,
    githubRef,
  }

  const eventBatch: Parameters<typeof logEvents>[0] = []

  // 1. Log the pipeline outcome
  switch (result.outcome) {
    case "allowed":
      eventBatch.push({
        ...baseEvent,
        action: "pipeline_allowed",
        severity: "success",
        description: `@${ctx.senderLogin} passed all ${result.rulesChecked} enabled rules`,
        metadata: {
          ...extraMetadata,
          rulesChecked: result.rulesChecked,
          evaluations: result.evaluations.map((e) => ({
            rule: e.rule,
            passed: e.passed,
            actual: e.actual,
            threshold: e.threshold,
          })),
        },
      })
      break

    case "blocked":
      eventBatch.push({
        ...baseEvent,
        action: "pipeline_blocked",
        severity: "error",
        ruleName: result.blockingRule,
        description: result.blockReason,
        metadata: {
          ...extraMetadata,
          rulesChecked: result.rulesChecked,
          blockingRule: result.blockingRule,
          evaluations: result.evaluations.map((e) => ({
            rule: e.rule,
            passed: e.passed,
            actual: e.actual,
            threshold: e.threshold,
          })),
        },
      })
      break

    case "whitelist_bypass":
      eventBatch.push({
        ...baseEvent,
        action: "whitelist_bypass",
        severity: "info",
        description: `@${ctx.senderLogin} is whitelisted — all rules skipped`,
        metadata: extraMetadata,
      })
      break

    case "blacklist_blocked":
      eventBatch.push({
        ...baseEvent,
        action: "blacklist_blocked",
        severity: "error",
        description: `@${ctx.senderLogin} is blacklisted — automatically blocked`,
        metadata: extraMetadata,
      })
      break

    case "warned":
      eventBatch.push({
        ...baseEvent,
        action: "pipeline_warned",
        severity: "warning",
        ruleName: result.blockingRule,
        description: `Warning: ${result.blockReason}`,
        metadata: {
          ...extraMetadata,
          rulesChecked: result.rulesChecked,
          blockingRule: result.blockingRule,
          ruleAction: result.resolvedAction ?? "warn",
        },
      })
      break

    case "logged":
      eventBatch.push({
        ...baseEvent,
        action: "pipeline_logged",
        severity: "info",
        ruleName: result.blockingRule,
        description: `Logged (no action): ${result.blockReason}`,
        metadata: {
          ...extraMetadata,
          rulesChecked: result.rulesChecked,
          blockingRule: result.blockingRule,
          ruleAction: "log",
        },
      })
      break

    case "unable_to_verify":
      eventBatch.push({
        ...baseEvent,
        action: "pipeline_warned",
        severity: "warning",
        ruleName: result.blockingRule,
        description: `Unable to verify: ${result.blockReason}`,
        metadata: {
          ...extraMetadata,
          rulesChecked: result.rulesChecked,
          blockingRule: result.blockingRule,
          ruleAction: "unable_to_verify",
        },
      })
      break
  }

  // 2. Log near-miss warnings (only for allowed outcomes)
  if (result.allowed) {
    for (const eval_ of result.evaluations) {
      if (eval_.nearMiss) {
        eventBatch.push({
          ...baseEvent,
          action: "rule_near_miss",
          severity: "warning",
          ruleName: eval_.rule,
          description: `@${ctx.senderLogin} nearly triggered ${eval_.rule}: ${eval_.actual} (threshold: ${eval_.threshold})`,
          metadata: {
            rule: eval_.rule,
            actual: eval_.actual,
            threshold: eval_.threshold,
          },
        })
      }
    }
  }

  await logEvents(eventBatch)
}

// ─── Webhook action handlers ───────────────────────────────────

/**
 * Execute the resolved action on a PR/issue/comment based on the pipeline result.
 *
 * Actions:
 * - "block"     → close the PR/issue or delete the comment
 * - "warn"      → leave a comment but don't close/delete
 * - "log"       → do nothing (event already logged by logPipelineEvents)
 * - "threshold" → treated as "block" (threshold counting is TODO)
 */

export async function handlePullRequest(
  ctx: WebhookContext,
  prNumber: number,
  prTitle: string,
  prBody?: string
) {
  const prCtx = { ...ctx, prNumber }
  const result = await runFilterPipeline(
    prCtx,
    prBody ?? prTitle,
    "pull_request"
  )

  const githubRef = `#${prNumber}`
  const extraMeta = { title: prTitle }

  await logPipelineEvents(result, ctx, "pull_request", githubRef, extraMeta)

  if (result.outcome === "allowed" || !result.blockReason) return

  const action = result.resolvedAction ?? "block"
  const [owner, repo] = ctx.repoFullName.split("/")
  const prefs = await loadPrefsForInstallation(ctx.installationId)
  // routeMode "silent" runs the pipeline and logs events but does not touch
  // GitHub. TODO(checks-api): "check" / "both" will publish a GitHub Check.
  if (prefs?.routeMode === "silent") return

  const token = await getInstallationToken(ctx.installationId)

  if (result.outcome === "blocked" || result.outcome === "blacklist_blocked") {
    const comment = renderBlockedComment({
      prefs,
      blockReason: result.blockReason,
      ruleName: result.blockingRule,
      repoFullName: ctx.repoFullName,
      username: ctx.senderLogin,
      outcome: result.outcome,
      kind: "pull_request",
      appBaseUrl: APP_BASE_URL,
    })
    await closePullRequest(token, owner, repo, prNumber, comment)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "pr_closed",
        severity: "error",
        contentType: "pull_request",
        ruleName: result.blockingRule,
        description: `Closed PR ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: {
          title: prTitle,
          reason: result.blockReason,
          ruleAction: action,
        },
      })
    }
  } else if (
    result.outcome === "warned" ||
    result.outcome === "unable_to_verify"
  ) {
    const comment = renderWarnedComment({
      prefs,
      blockReason: result.blockReason,
      ruleName: result.blockingRule,
      repoFullName: ctx.repoFullName,
      username: ctx.senderLogin,
      outcome: result.outcome,
      kind: "pull_request",
      appBaseUrl: APP_BASE_URL,
    })
    await addComment(token, owner, repo, prNumber, comment)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "pipeline_warned",
        severity: "warning",
        contentType: "pull_request",
        ruleName: result.blockingRule,
        description: `Warned on PR ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: {
          title: prTitle,
          reason: result.blockReason,
          ruleAction: action,
        },
      })
    }
  }
  // "logged" → no GitHub action, pipeline events already logged
}

export async function handleIssue(
  ctx: WebhookContext,
  issueNumber: number,
  issueTitle: string,
  issueBody?: string
) {
  const result = await runFilterPipeline(ctx, issueBody ?? issueTitle, "issue")

  const githubRef = `#${issueNumber}`
  const extraMeta = { title: issueTitle }

  await logPipelineEvents(result, ctx, "issue", githubRef, extraMeta)

  if (result.outcome === "allowed" || !result.blockReason) return

  const action = result.resolvedAction ?? "block"
  const [owner, repo] = ctx.repoFullName.split("/")
  const prefs = await loadPrefsForInstallation(ctx.installationId)
  if (prefs?.routeMode === "silent") return

  const token = await getInstallationToken(ctx.installationId)

  if (result.outcome === "blocked" || result.outcome === "blacklist_blocked") {
    const comment = renderBlockedComment({
      prefs,
      blockReason: result.blockReason,
      ruleName: result.blockingRule,
      repoFullName: ctx.repoFullName,
      username: ctx.senderLogin,
      outcome: result.outcome,
      kind: "issue",
      appBaseUrl: APP_BASE_URL,
    })
    await closeIssue(token, owner, repo, issueNumber, comment)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "issue_closed",
        severity: "error",
        contentType: "issue",
        ruleName: result.blockingRule,
        description: `Closed issue ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: {
          title: issueTitle,
          reason: result.blockReason,
          ruleAction: action,
        },
      })
    }
  } else if (
    result.outcome === "warned" ||
    result.outcome === "unable_to_verify"
  ) {
    const comment = renderWarnedComment({
      prefs,
      blockReason: result.blockReason,
      ruleName: result.blockingRule,
      repoFullName: ctx.repoFullName,
      username: ctx.senderLogin,
      outcome: result.outcome,
      kind: "issue",
      appBaseUrl: APP_BASE_URL,
    })
    await addComment(token, owner, repo, issueNumber, comment)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "pipeline_warned",
        severity: "warning",
        contentType: "issue",
        ruleName: result.blockingRule,
        description: `Warned on issue ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: {
          title: issueTitle,
          reason: result.blockReason,
          ruleAction: action,
        },
      })
    }
  }
}

export async function handleComment(
  ctx: WebhookContext,
  commentId: number,
  issueNumber: number,
  commentBody?: string
) {
  const result = await runFilterPipeline(ctx, commentBody, "comment")

  const githubRef = `#${issueNumber}/comment/${commentId}`

  await logPipelineEvents(result, ctx, "comment", githubRef)

  if (result.outcome === "allowed" || !result.blockReason) return

  const action = result.resolvedAction ?? "block"
  const [owner, repo] = ctx.repoFullName.split("/")
  const prefs = await loadPrefsForInstallation(ctx.installationId)
  if (prefs?.routeMode === "silent") return

  const token = await getInstallationToken(ctx.installationId)

  if (result.outcome === "blocked" || result.outcome === "blacklist_blocked") {
    await deleteComment(token, owner, repo, commentId)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "comment_deleted",
        severity: "error",
        contentType: "comment",
        ruleName: result.blockingRule,
        description: `Deleted comment on ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: { reason: result.blockReason, ruleAction: action },
      })
    }
  } else if (
    result.outcome === "warned" ||
    result.outcome === "unable_to_verify"
  ) {
    const comment = renderWarnedComment({
      prefs,
      blockReason: result.blockReason,
      ruleName: result.blockingRule,
      repoFullName: ctx.repoFullName,
      username: ctx.senderLogin,
      outcome: result.outcome,
      kind: "comment",
      appBaseUrl: APP_BASE_URL,
    })
    await addComment(token, owner, repo, issueNumber, comment)

    if (result.repoId) {
      await logEvent({
        repoId: result.repoId,
        action: "pipeline_warned",
        severity: "warning",
        contentType: "comment",
        ruleName: result.blockingRule,
        description: `Warned on comment ${githubRef}: ${result.blockReason}`,
        targetGithubUsername: ctx.senderLogin,
        targetGithubUserId: ctx.senderId,
        githubRef,
        metadata: { reason: result.blockReason, ruleAction: action },
      })
    }
  }
}
