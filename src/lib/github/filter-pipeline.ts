import { eq } from "drizzle-orm";
import { db } from "#/db";
import {
	repositories,
	ruleConfigs,
	whitelistEntries,
	blacklistEntries,
	DEFAULT_RULE_CONFIG,
	type RuleConfig,
	type RuleAction,
	type EventContentType,
} from "#/db/schema";
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
} from "./github-api";
import { logEvent, logEvents } from "#/lib/events";

// ─── Types ─────────────────────────────────────────────────────

export interface WebhookContext {
	installationId: number;
	repoFullName: string; // "owner/repo"
	githubRepoId: number;
	senderLogin: string;
	senderId: number;
	prNumber?: number; // For PR-specific rules like maxFilesChanged
}

export interface RuleEvaluation {
	rule: string;
	passed: boolean;
	nearMiss: boolean;
	reason?: string;
	/** The configured action for this rule */
	action?: RuleAction;
	/** The actual value measured (for numeric rules) */
	actual?: number;
	/** The configured threshold/limit (for numeric rules) */
	threshold?: number;
}

export interface PipelineResult {
	/** Whether the content was allowed through */
	allowed: boolean;
	/** How the pipeline resolved */
	outcome: "allowed" | "blocked" | "warned" | "logged" | "whitelist_bypass" | "blacklist_blocked" | "repo_not_found";
	/** The rule that blocked/warned (if any) */
	blockingRule?: string;
	/** Human-readable reason */
	blockReason?: string;
	/** The action to take based on the first failing rule */
	resolvedAction?: RuleAction;
	/** Detailed evaluation of each rule that was checked */
	evaluations: RuleEvaluation[];
	/** Number of enabled rules that were checked */
	rulesChecked: number;
	/** Internal repo ID (for event logging) */
	repoId?: string;
}

// ─── Near-miss threshold ───────────────────────────────────────
// A user is "near miss" if their value is within 20% of triggering.
const NEAR_MISS_RATIO = 0.2;

function isNearMissMin(actual: number, threshold: number): boolean {
	// For "minimum" rules: user passed but is close to failing
	// e.g., accountAge: required 30 days, account is 35 days → within 20%
	if (actual < threshold) return false; // already blocked, not a near-miss
	return actual < threshold * (1 + NEAR_MISS_RATIO);
}

function isNearMissMax(actual: number, limit: number): boolean {
	// For "maximum" rules: user passed but is close to hitting the limit
	// e.g., maxPrsPerDay: limit 5, user has 4 → within 20%
	if (actual >= limit) return false; // already blocked
	return actual >= limit * (1 - NEAR_MISS_RATIO);
}

// ─── Content analysis helpers ──────────────────────────────────

const ENGLISH_MARKERS = [
	"the", "is", "are", "was", "were", "have", "has", "been",
	"will", "would", "could", "should", "this", "that", "with",
	"from", "for", "not", "but", "and", "you", "your",
];

function isLikelyLanguage(text: string, language: string): boolean {
	if (language !== "english") return true;

	const words = text.toLowerCase().split(/\s+/);
	if (words.length < 5) return true;

	const englishWordCount = words.filter((w) =>
		ENGLISH_MARKERS.includes(w),
	).length;
	const ratio = englishWordCount / words.length;

	return ratio >= 0.05;
}

const AI_SLOP_PATTERNS = [
	/as an ai language model/i,
	/as a large language model/i,
	/i cannot and will not/i,
	/i'm an ai assistant/i,
	/certainly! here(?:'s| is)/i,
	/i'd be happy to help/i,
	/great question!/i,
	/\bdelve\b.*\bintricacies\b/i,
	/\beverchanging\b/i,
	/\btapestry\b.*\b(?:innovation|landscape)\b/i,
	/(?:it's worth noting|it is worth noting) that/i,
	/(?:in today's|in the) (?:rapidly )?(?:evolving|changing) (?:landscape|world)/i,
];

function detectAiSlop(text: string): string | null {
	for (const pattern of AI_SLOP_PATTERNS) {
		if (pattern.test(text)) {
			return `matched pattern: ${pattern.source}`;
		}
	}
	return null;
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
];

/**
 * Scan text for cryptocurrency wallet addresses.
 * Returns the first match found, or null if clean.
 */
function detectCryptoAddress(text: string): { crypto: string; address: string } | null {
	for (const { name, pattern } of CRYPTO_PATTERNS) {
		const match = text.match(pattern);
		if (match) {
			return { crypto: name, address: match[0] };
		}
	}
	return null;
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
): Promise<PipelineResult> {
	const evaluations: RuleEvaluation[] = [];
	let rulesChecked = 0;

	// 1. Look up the repo in our DB
	const [repo] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.githubRepoId, ctx.githubRepoId));

	if (!repo) {
		return {
			allowed: true,
			outcome: "repo_not_found",
			evaluations,
			rulesChecked,
		};
	}

	// 2. Auto-bypass: repo owner, admins, and collaborators with push access
	const [repoOwner] = ctx.repoFullName.split("/");
	if (repoOwner.toLowerCase() === ctx.senderLogin.toLowerCase()) {
		return {
			allowed: true,
			outcome: "whitelist_bypass",
			evaluations,
			rulesChecked,
			repoId: repo.id,
		};
	}

	// Check if sender has push/admin/maintain access (collaborator)
	try {
		const earlyToken = await getInstallationToken(ctx.installationId);
		const permResult = await getCollaboratorPermission(earlyToken, ctx.repoFullName, ctx.senderLogin);
		if (permResult === "admin" || permResult === "write" || permResult === "maintain") {
			return {
				allowed: true,
				outcome: "whitelist_bypass",
				evaluations,
				rulesChecked,
				repoId: repo.id,
			};
		}
	} catch {
		// permission check failed, continue to whitelist/blacklist checks
	}

	// 3. Check whitelist
	const whitelistAll = await db
		.select()
		.from(whitelistEntries)
		.where(eq(whitelistEntries.repoId, repo.id));

	if (whitelistAll.some((w) => w.githubUsername.toLowerCase() === ctx.senderLogin.toLowerCase())) {
		return {
			allowed: true,
			outcome: "whitelist_bypass",
			evaluations,
			rulesChecked,
			repoId: repo.id,
		};
	}

	// 3. Check blacklist
	const blacklistAll = await db
		.select()
		.from(blacklistEntries)
		.where(eq(blacklistEntries.repoId, repo.id));

	if (blacklistAll.some((b) => b.githubUsername === ctx.senderLogin)) {
		return {
			allowed: false,
			outcome: "blacklist_blocked",
			blockingRule: "blacklist",
			blockReason: `@${ctx.senderLogin} is blacklisted from this repository.`,
			evaluations,
			rulesChecked,
			repoId: repo.id,
		};
	}

	// 4. Load rule config
	const [configRow] = await db
		.select()
		.from(ruleConfigs)
		.where(eq(ruleConfigs.repoId, repo.id));

	const rawConfig = configRow?.config;
	const config: RuleConfig = {
		aiSlopDetection: { ...DEFAULT_RULE_CONFIG.aiSlopDetection, ...rawConfig?.aiSlopDetection },
		languageRequirement: { ...DEFAULT_RULE_CONFIG.languageRequirement, ...rawConfig?.languageRequirement },
		minMergedPrs: { ...DEFAULT_RULE_CONFIG.minMergedPrs, ...rawConfig?.minMergedPrs },
		accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...rawConfig?.accountAge },
		maxPrsPerDay: { ...DEFAULT_RULE_CONFIG.maxPrsPerDay, ...rawConfig?.maxPrsPerDay },
		maxFilesChanged: { ...DEFAULT_RULE_CONFIG.maxFilesChanged, ...rawConfig?.maxFilesChanged },
		repoActivityMinimum: { ...DEFAULT_RULE_CONFIG.repoActivityMinimum, ...rawConfig?.repoActivityMinimum },
		requireProfileReadme: { ...DEFAULT_RULE_CONFIG.requireProfileReadme, ...rawConfig?.requireProfileReadme },
		cryptoAddressDetection: { ...DEFAULT_RULE_CONFIG.cryptoAddressDetection, ...rawConfig?.cryptoAddressDetection },
	};

	const token = await getInstallationToken(ctx.installationId);

	// Fetch user once for rules that need it
	let ghUser: Record<string, unknown> | null = null;
	const needsUser =
		config.accountAge.enabled;
	if (needsUser) {
		try {
			ghUser = await getUser(token, ctx.senderLogin);
		} catch {
			// If we can't fetch user info, skip user-dependent rules
		}
	}

	// Helper: if a rule fails, we still continue checking remaining rules
	// for near-miss detection, but we track the first failure.
	let firstBlock: { rule: string; reason: string; action: RuleAction } | null = null;

	// ─── accountAge ────────────────────────────────────────────
	if (config.accountAge.enabled && ghUser) {
		rulesChecked++;
		const createdAt = new Date(ghUser.created_at as string);
		const ageInDays = Math.floor(
			(Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
		);
		const threshold = config.accountAge.days;
		const blocked = ageInDays < threshold;

		const eval_: RuleEvaluation = {
			rule: "accountAge",
			passed: !blocked,
			nearMiss: !blocked && isNearMissMin(ageInDays, threshold),
			actual: ageInDays,
			threshold,
			reason: blocked
				? `Account @${ctx.senderLogin} is ${ageInDays} days old (minimum: ${threshold} days).`
				: undefined,
		};
		evaluations.push(eval_);

		if (blocked && !firstBlock) {
			firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.accountAge.action };
		}
	}

	// ─── minMergedPrs ──────────────────────────────────────────
	if (config.minMergedPrs.enabled) {
		rulesChecked++;
		try {
			const count = await getMergedPrCount(token, ctx.senderLogin);
			const threshold = config.minMergedPrs.count;
			const blocked = count < threshold;

			const eval_: RuleEvaluation = {
				rule: "minMergedPrs",
				passed: !blocked,
				nearMiss: !blocked && isNearMissMin(count, threshold),
				actual: count,
				threshold,
				reason: blocked
					? `@${ctx.senderLogin} has ${count} merged PRs (minimum: ${threshold}).`
					: undefined,
			};
			evaluations.push(eval_);

			if (blocked && !firstBlock) {
				firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.minMergedPrs.action };
			}
		} catch {
			// Skip if API fails
		}
	}

	// ─── languageRequirement ───────────────────────────────────
	if (config.languageRequirement.enabled && contentText && contentText.length > 20) {
		rulesChecked++;
		const requiredLang = config.languageRequirement.language.toLowerCase();
		const passed = isLikelyLanguage(contentText, requiredLang);

		const eval_: RuleEvaluation = {
			rule: "languageRequirement",
			passed,
			nearMiss: false, // binary check, no near-miss
			reason: !passed
				? `Content from @${ctx.senderLogin} does not appear to be in ${config.languageRequirement.language}.`
				: undefined,
		};
		evaluations.push(eval_);

		if (!passed && !firstBlock) {
			firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.languageRequirement.action };
		}
	}

	// ─── aiSlopDetection ───────────────────────────────────────
	if (config.aiSlopDetection.enabled && contentText) {
		rulesChecked++;
		const slopMatch = detectAiSlop(contentText);
		const blocked = slopMatch !== null;

		const eval_: RuleEvaluation = {
			rule: "aiSlopDetection",
			passed: !blocked,
			nearMiss: false, // binary check
			reason: blocked
				? `Content from @${ctx.senderLogin} was flagged as AI-generated: ${slopMatch}`
				: undefined,
		};
		evaluations.push(eval_);

		if (blocked && !firstBlock) {
			firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.aiSlopDetection.action };
		}
	}

	// ─── maxPrsPerDay ──────────────────────────────────────────
	if (config.maxPrsPerDay.enabled) {
		rulesChecked++;
		try {
			const count = await countUserPrsToday(token, ctx.senderLogin, ctx.repoFullName);
			const limit = config.maxPrsPerDay.limit;
			const blocked = count >= limit;

			const eval_: RuleEvaluation = {
				rule: "maxPrsPerDay",
				passed: !blocked,
				nearMiss: !blocked && isNearMissMax(count, limit),
				actual: count,
				threshold: limit,
				reason: blocked
					? `@${ctx.senderLogin} has already opened ${count} PRs today (limit: ${limit}).`
					: undefined,
			};
			evaluations.push(eval_);

			if (blocked && !firstBlock) {
				firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.maxPrsPerDay.action };
			}
		} catch {
			// Skip if API fails
		}
	}

	// ─── maxFilesChanged ───────────────────────────────────────
	if (config.maxFilesChanged.enabled && ctx.prNumber) {
		rulesChecked++;
		try {
			const [owner, repoName] = ctx.repoFullName.split("/");
			const filesCount = await getPrFilesCount(token, owner, repoName, ctx.prNumber);
			const limit = config.maxFilesChanged.limit;
			const blocked = filesCount > limit;

			const eval_: RuleEvaluation = {
				rule: "maxFilesChanged",
				passed: !blocked,
				nearMiss: !blocked && isNearMissMax(filesCount, limit),
				actual: filesCount,
				threshold: limit,
				reason: blocked
					? `This PR changes ${filesCount} files (limit: ${limit}).`
					: undefined,
			};
			evaluations.push(eval_);

			if (blocked && !firstBlock) {
				firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.maxFilesChanged.action };
			}
		} catch {
			// Skip if API fails
		}
	}

	// ─── repoActivityMinimum ───────────────────────────────────
	if (config.repoActivityMinimum.enabled) {
		rulesChecked++;
		try {
			const repoCount = await getUserPublicRepoCount(token, ctx.senderLogin);
			const threshold = config.repoActivityMinimum.minRepos;
			const blocked = repoCount < threshold;

			const eval_: RuleEvaluation = {
				rule: "repoActivityMinimum",
				passed: !blocked,
				nearMiss: !blocked && isNearMissMin(repoCount, threshold),
				actual: repoCount,
				threshold,
				reason: blocked
					? `@${ctx.senderLogin} has ${repoCount} public repos (minimum: ${threshold}).`
					: undefined,
			};
			evaluations.push(eval_);

			if (blocked && !firstBlock) {
				firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.repoActivityMinimum.action };
			}
		} catch {
			// Skip if API fails
		}
	}

	// ─── requireProfileReadme ──────────────────────────────────
	if (config.requireProfileReadme.enabled) {
		rulesChecked++;
		try {
			const hasReadme = await hasProfileReadme(token, ctx.senderLogin);

			const eval_: RuleEvaluation = {
				rule: "requireProfileReadme",
				passed: hasReadme,
				nearMiss: false, // binary check
				reason: !hasReadme
					? `@${ctx.senderLogin} does not have a profile README.`
					: undefined,
			};
			evaluations.push(eval_);

			if (!hasReadme && !firstBlock) {
				firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.requireProfileReadme.action };
			}
		} catch {
			// Skip if API fails
		}
	}

	// ─── cryptoAddressDetection ────────────────────────────────
	if (config.cryptoAddressDetection.enabled && contentText) {
		rulesChecked++;
		const cryptoMatch = detectCryptoAddress(contentText);
		const blocked = cryptoMatch !== null;

		const eval_: RuleEvaluation = {
			rule: "cryptoAddressDetection",
			passed: !blocked,
			nearMiss: false, // binary check
			action: config.cryptoAddressDetection.action,
			reason: blocked
				? `Content from @${ctx.senderLogin} contains a ${cryptoMatch!.crypto} address: ${cryptoMatch!.address.substring(0, 12)}...`
				: undefined,
		};
		evaluations.push(eval_);

		if (blocked && !firstBlock) {
			firstBlock = { rule: eval_.rule, reason: eval_.reason!, action: config.cryptoAddressDetection.action };
		}
	}

	// ─── Result ────────────────────────────────────────────────
	if (firstBlock) {
		const action = firstBlock.action;
		// "log" means we record but don't act — content is effectively allowed
		const allowed = action === "log";
		const outcome = action === "block" || action === "threshold"
			? "blocked"
			: action === "warn"
				? "warned"
				: "logged";

		return {
			allowed,
			outcome,
			blockingRule: firstBlock.rule,
			blockReason: firstBlock.reason,
			resolvedAction: action,
			evaluations,
			rulesChecked,
			repoId: repo.id,
		};
	}

	return {
		allowed: true,
		outcome: "allowed",
		evaluations,
		rulesChecked,
		repoId: repo.id,
	};
}

// ─── Pipeline event logging ────────────────────────────────────

/**
 * Generate a unique pipeline ID for grouping events from the same evaluation.
 */
function generatePipelineId(): string {
	return crypto.randomUUID();
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
	extraMetadata?: Record<string, unknown>,
) {
	if (!result.repoId) return;

	const pipelineId = generatePipelineId();
	const baseEvent = {
		repoId: result.repoId,
		pipelineId,
		contentType,
		targetGithubUsername: ctx.senderLogin,
		targetGithubUserId: ctx.senderId,
		githubRef,
	};

	const eventBatch: Parameters<typeof logEvents>[0] = [];

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
			});
			break;

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
			});
			break;

		case "whitelist_bypass":
			eventBatch.push({
				...baseEvent,
				action: "whitelist_bypass",
				severity: "info",
				description: `@${ctx.senderLogin} is whitelisted — all rules skipped`,
				metadata: extraMetadata,
			});
			break;

		case "blacklist_blocked":
			eventBatch.push({
				...baseEvent,
				action: "blacklist_blocked",
				severity: "error",
				description: `@${ctx.senderLogin} is blacklisted — automatically blocked`,
				metadata: extraMetadata,
			});
			break;

		case "warned":
			eventBatch.push({
				...baseEvent,
				action: "pipeline_blocked",
				severity: "warning",
				ruleName: result.blockingRule,
				description: `Warning: ${result.blockReason}`,
				metadata: {
					...extraMetadata,
					rulesChecked: result.rulesChecked,
					blockingRule: result.blockingRule,
					ruleAction: "warn",
				},
			});
			break;

		case "logged":
			eventBatch.push({
				...baseEvent,
				action: "pipeline_blocked",
				severity: "info",
				ruleName: result.blockingRule,
				description: `Logged (no action): ${result.blockReason}`,
				metadata: {
					...extraMetadata,
					rulesChecked: result.rulesChecked,
					blockingRule: result.blockingRule,
					ruleAction: "log",
				},
			});
			break;
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
				});
			}
		}
	}

	await logEvents(eventBatch);
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
	prBody?: string,
) {
	const prCtx = { ...ctx, prNumber };
	const result = await runFilterPipeline(prCtx, prBody ?? prTitle);

	const githubRef = `#${prNumber}`;
	const extraMeta = { title: prTitle };

	await logPipelineEvents(result, ctx, "pull_request", githubRef, extraMeta);

	if (result.outcome === "allowed" || !result.blockReason) return;

	const action = result.resolvedAction ?? "block";
	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	if (action === "block" || action === "threshold") {
		const comment = `> **Tripwire** — This PR was automatically closed.\n>\n> Reason: ${result.blockReason}`;
		await closePullRequest(token, owner, repo, prNumber, comment);

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
				metadata: { title: prTitle, reason: result.blockReason, ruleAction: action },
			});
		}
	} else if (action === "warn") {
		const comment = `> **Tripwire** — Warning\n>\n> ${result.blockReason}\n>\n> _This is a warning — no action was taken._`;
		await addComment(token, owner, repo, prNumber, comment);

		if (result.repoId) {
			await logEvent({
				repoId: result.repoId,
				action: "pipeline_blocked",
				severity: "warning",
				contentType: "pull_request",
				ruleName: result.blockingRule,
				description: `Warned on PR ${githubRef}: ${result.blockReason}`,
				targetGithubUsername: ctx.senderLogin,
				targetGithubUserId: ctx.senderId,
				githubRef,
				metadata: { title: prTitle, reason: result.blockReason, ruleAction: "warn" },
			});
		}
	}
	// "log" → no GitHub action, pipeline events already logged
}

export async function handleIssue(
	ctx: WebhookContext,
	issueNumber: number,
	issueTitle: string,
	issueBody?: string,
) {
	const result = await runFilterPipeline(ctx, issueBody ?? issueTitle);

	const githubRef = `#${issueNumber}`;
	const extraMeta = { title: issueTitle };

	await logPipelineEvents(result, ctx, "issue", githubRef, extraMeta);

	if (result.outcome === "allowed" || !result.blockReason) return;

	const action = result.resolvedAction ?? "block";
	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	if (action === "block" || action === "threshold") {
		const comment = `> **Tripwire** — This issue was automatically closed.\n>\n> Reason: ${result.blockReason}`;
		await closeIssue(token, owner, repo, issueNumber, comment);

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
				metadata: { title: issueTitle, reason: result.blockReason, ruleAction: action },
			});
		}
	} else if (action === "warn") {
		const comment = `> **Tripwire** — Warning\n>\n> ${result.blockReason}\n>\n> _This is a warning — no action was taken._`;
		await addComment(token, owner, repo, issueNumber, comment);

		if (result.repoId) {
			await logEvent({
				repoId: result.repoId,
				action: "pipeline_blocked",
				severity: "warning",
				contentType: "issue",
				ruleName: result.blockingRule,
				description: `Warned on issue ${githubRef}: ${result.blockReason}`,
				targetGithubUsername: ctx.senderLogin,
				targetGithubUserId: ctx.senderId,
				githubRef,
				metadata: { title: issueTitle, reason: result.blockReason, ruleAction: "warn" },
			});
		}
	}
}

export async function handleComment(
	ctx: WebhookContext,
	commentId: number,
	issueNumber: number,
	commentBody?: string,
) {
	const result = await runFilterPipeline(ctx, commentBody);

	const githubRef = `#${issueNumber}/comment/${commentId}`;

	await logPipelineEvents(result, ctx, "comment", githubRef);

	if (result.outcome === "allowed" || !result.blockReason) return;

	const action = result.resolvedAction ?? "block";
	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	if (action === "block" || action === "threshold") {
		await deleteComment(token, owner, repo, commentId);

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
			});
		}
	} else if (action === "warn") {
		const comment = `> **Tripwire** — Warning\n>\n> ${result.blockReason}\n>\n> _This is a warning — no action was taken._`;
		await addComment(token, owner, repo, issueNumber, comment);

		if (result.repoId) {
			await logEvent({
				repoId: result.repoId,
				action: "pipeline_blocked",
				severity: "warning",
				contentType: "comment",
				ruleName: result.blockingRule,
				description: `Warned on comment ${githubRef}: ${result.blockReason}`,
				targetGithubUsername: ctx.senderLogin,
				targetGithubUserId: ctx.senderId,
				githubRef,
				metadata: { reason: result.blockReason, ruleAction: "warn" },
			});
		}
	}
}
