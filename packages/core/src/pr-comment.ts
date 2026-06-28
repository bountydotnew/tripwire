import {
  DEFAULT_PR_COMMENT_PREFERENCES,
  type OrgPrCommentPreferences,
} from "@tripwire/db"
import { ruleLabel } from "./rules/labels"

export type CommentKind = "pull_request" | "issue" | "comment"

export type RenderOutcome =
  | "blocked"
  | "warned"
  | "blacklist_blocked"
  | "unable_to_verify"

export interface RenderCommentInput {
  /** Org-scoped prefs, or null to use defaults. */
  prefs: OrgPrCommentPreferences | null
  /** Human-readable reason produced by the pipeline. */
  blockReason: string
  /** Internal rule name (e.g. "accountAge"). Mapped to a friendly label. */
  ruleName?: string
  /** "owner/repo" string used to build the appeal URL. */
  repoFullName: string
  /** Sender's GitHub login (no @ prefix). */
  username: string
  outcome: RenderOutcome
  kind: CommentKind
  /** Base URL for appeal links. Server: env.BETTER_AUTH_URL. Preview: placeholder. */
  appBaseUrl: string
}

type ResolvedPrefs = Omit<
  OrgPrCommentPreferences,
  "betterAuthOrgId" | "createdAt" | "updatedAt"
>

function resolvePrefs(prefs: OrgPrCommentPreferences | null): ResolvedPrefs {
  if (!prefs) return DEFAULT_PR_COMMENT_PREFERENCES
  return prefs
}

function subjectNoun(kind: CommentKind): string {
  if (kind === "pull_request") return "PR"
  if (kind === "issue") return "issue"
  return "comment"
}

function botName(prefs: ResolvedPrefs): string {
  const trimmed = prefs.botDisplayName?.trim()
  return trimmed && trimmed.length > 0 ? trimmed : "Tripwire"
}

function blockedLeadingLine(prefs: ResolvedPrefs, subject: string): string {
  const bot = botName(prefs)
  if (prefs.tone === "formal") {
    return `**${bot}**: This ${subject} was closed automatically because it did not meet repository policy.`
  }
  if (prefs.tone === "casual") {
    return `**${bot}**: Heads up, we closed this ${subject} automatically.`
  }
  return `**${bot}**: This ${subject} was automatically closed.`
}

function warnedLeadingLine(prefs: ResolvedPrefs): string {
  const bot = botName(prefs)
  if (prefs.tone === "formal") return `**${bot}**: Policy advisory.`
  if (prefs.tone === "casual") return `**${bot}**: Hey, a quick note.`
  return `**${bot}**: Warning.`
}

export function buildAppealUrl(
  appBaseUrl: string,
  repoFullName: string,
  username: string
): string {
  const base = (appBaseUrl ?? "").replace(/\/$/, "")
  const path = `/request/${repoFullName}?kind=unblock&u=${encodeURIComponent(username)}`
  return base ? `${base}${path}` : path
}

function appealLineFor(input: RenderCommentInput): string {
  const url = buildAppealUrl(
    input.appBaseUrl,
    input.repoFullName,
    input.username
  )
  if (input.outcome === "blacklist_blocked") {
    return `> **Blacklisted from this repository.** [Appeal this block as @${input.username}](${url}) if you think it was a mistake.`
  }
  return `> Think this was a mistake? [Request a review as @${input.username}](${url})`
}

function appendCustomFooter(lines: string[], prefs: ResolvedPrefs) {
  const text = prefs.customFooterText?.trim()
  if (!text) return
  const quoted = text
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n")
  lines.push(">", quoted)
}

export function renderBlockedComment(input: RenderCommentInput): string {
  const prefs = resolvePrefs(input.prefs)
  const subject = subjectNoun(input.kind)

  const lines: string[] = []
  lines.push("> " + blockedLeadingLine(prefs, subject))

  if (prefs.showReason) {
    lines.push(">", `> Reason: ${input.blockReason}`)
  }
  if (prefs.showRuleName && input.ruleName) {
    lines.push(">", `> _Rule: ${ruleLabel(input.ruleName)}_`)
  }
  if (prefs.showAppealLink) {
    lines.push(">", appealLineFor(input))
  }
  appendCustomFooter(lines, prefs)

  return lines.join("\n")
}

export function renderWarnedComment(input: RenderCommentInput): string {
  const prefs = resolvePrefs(input.prefs)

  const lines: string[] = []
  lines.push("> " + warnedLeadingLine(prefs))

  if (prefs.showReason) {
    lines.push(">", `> Reason: ${input.blockReason}`)
  }
  if (prefs.showWarningDisclaimer) {
    lines.push(">", "> _This is a warning. No action was taken._")
  }
  if (prefs.showRuleName && input.ruleName) {
    lines.push(">", `> _Rule: ${ruleLabel(input.ruleName)}_`)
  }
  // No appeal/access link on warned comments. A warn-side "request access"
  // funnel is a spam vector: bots that trip a warn rule would flood the
  // vouch queue. Blocked comments keep the appeal link; warned do not.
  appendCustomFooter(lines, prefs)

  return lines.join("\n")
}
