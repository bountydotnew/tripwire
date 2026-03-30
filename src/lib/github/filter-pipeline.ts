import { eq } from "drizzle-orm";
import { db } from "#/db";
import {
	repositories,
	ruleConfigs,
	whitelistEntries,
	blacklistEntries,
	events,
	DEFAULT_RULE_CONFIG,
	type RuleConfig,
} from "#/db/schema";
import {
	getInstallationToken,
	closePullRequest,
	closeIssue,
	deleteComment,
	getUser,
	getMergedPrCount,
	countUserPrsToday,
	getPrFilesCount,
	getUserPublicRepoCount,
	hasProfileReadme,
} from "./github-api";

interface WebhookContext {
	installationId: number;
	repoFullName: string; // "owner/repo"
	githubRepoId: number;
	senderLogin: string;
	senderId: number;
	prNumber?: number; // For PR-specific rules like maxFilesChanged
}

interface FilterResult {
	blocked: boolean;
	rule: string;
	reason: string;
}

// Common English words for language heuristic
const ENGLISH_MARKERS = [
	"the", "is", "are", "was", "were", "have", "has", "been",
	"will", "would", "could", "should", "this", "that", "with",
	"from", "for", "not", "but", "and", "you", "your",
];

/**
 * Simple heuristic language detection. Checks if the text likely matches
 * the expected language by looking for common word patterns.
 * Currently only supports English detection — other languages pass through.
 */
function isLikelyLanguage(text: string, language: string): boolean {
	if (language !== "english") {
		// Only English detection is implemented; allow other languages through
		return true;
	}

	const words = text.toLowerCase().split(/\s+/);
	if (words.length < 5) return true; // Too short to judge

	const englishWordCount = words.filter((w) =>
		ENGLISH_MARKERS.includes(w),
	).length;
	const ratio = englishWordCount / words.length;

	// If less than 5% of words are common English words, flag it
	return ratio >= 0.05;
}

// Known AI slop patterns
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

/**
 * Check text for known AI-generated content patterns.
 * Returns a description of the match, or null if clean.
 */
function detectAiSlop(text: string): string | null {
	for (const pattern of AI_SLOP_PATTERNS) {
		if (pattern.test(text)) {
			return `matched pattern: ${pattern.source}`;
		}
	}
	return null;
}

/**
 * Run all enabled rules against a GitHub user. Returns the first rule
 * that blocks, or null if the user passes all rules.
 *
 * @param contentText - Optional body text from the PR/issue/comment for content-based rules
 */
export async function runFilterPipeline(
	ctx: WebhookContext,
	contentText?: string,
): Promise<FilterResult | null> {
	// 1. Look up the repo in our DB
	const [repo] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.githubRepoId, ctx.githubRepoId));

	if (!repo) return null; // Repo not tracked by Tripwire

	// 2. Check whitelist — whitelisted users skip all rules
	const whitelistAll = await db
		.select()
		.from(whitelistEntries)
		.where(eq(whitelistEntries.repoId, repo.id));

	if (whitelistAll.some((w) => w.githubUsername === ctx.senderLogin)) {
		return null; // Whitelisted, skip all rules
	}

	// 3. Check blacklist — blacklisted users are always blocked
	const blacklistAll = await db
		.select()
		.from(blacklistEntries)
		.where(eq(blacklistEntries.repoId, repo.id));

	if (blacklistAll.some((b) => b.githubUsername === ctx.senderLogin)) {
		return {
			blocked: true,
			rule: "blacklist",
			reason: `@${ctx.senderLogin} is blacklisted from this repository.`,
		};
	}

	// 4. Load rule config (merge with defaults to handle missing fields)
	const [configRow] = await db
		.select()
		.from(ruleConfigs)
		.where(eq(ruleConfigs.repoId, repo.id));

	const rawConfig = configRow?.config;
	const config: RuleConfig = {
		aiSlopDetection: { ...DEFAULT_RULE_CONFIG.aiSlopDetection, ...rawConfig?.aiSlopDetection },
		requireProfilePicture: { ...DEFAULT_RULE_CONFIG.requireProfilePicture, ...rawConfig?.requireProfilePicture },
		languageRequirement: { ...DEFAULT_RULE_CONFIG.languageRequirement, ...rawConfig?.languageRequirement },
		minMergedPrs: { ...DEFAULT_RULE_CONFIG.minMergedPrs, ...rawConfig?.minMergedPrs },
		accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...rawConfig?.accountAge },
		maxPrsPerDay: { ...DEFAULT_RULE_CONFIG.maxPrsPerDay, ...rawConfig?.maxPrsPerDay },
		maxFilesChanged: { ...DEFAULT_RULE_CONFIG.maxFilesChanged, ...rawConfig?.maxFilesChanged },
		repoActivityMinimum: { ...DEFAULT_RULE_CONFIG.repoActivityMinimum, ...rawConfig?.repoActivityMinimum },
		requireProfileReadme: { ...DEFAULT_RULE_CONFIG.requireProfileReadme, ...rawConfig?.requireProfileReadme },
	};
	const token = await getInstallationToken(ctx.installationId);

	// Fetch user once for rules that need it
	let ghUser: Record<string, unknown> | null = null;
	const needsUser =
		config.requireProfilePicture.enabled ||
		config.accountAge.enabled;
	if (needsUser) {
		try {
			ghUser = await getUser(token, ctx.senderLogin);
		} catch {
			// If we can't fetch user info, skip user-dependent rules
		}
	}

	// 5. Run each enabled rule
	// --- Require profile picture ---
	if (config.requireProfilePicture.enabled && ghUser) {
		const avatarUrl = ghUser.avatar_url as string | undefined;
		// GitHub default avatars follow the pattern:
		// https://avatars.githubusercontent.com/u/{id}?v=4
		// Custom avatars have the same domain but won't match the /u/{id} pattern exactly
		// when the user has uploaded a profile picture.
		// The most reliable signal: default avatars have no gravatar_id and the URL
		// matches /u/{numeric_id} with no additional path segments.
		const isDefaultAvatar =
			!avatarUrl ||
			/\/u\/\d+\?/.test(avatarUrl);

		if (isDefaultAvatar) {
			return {
				blocked: true,
				rule: "requireProfilePicture",
				reason: `@${ctx.senderLogin} does not have a custom profile picture.`,
			};
		}
	}

	// --- Account age ---
	if (config.accountAge.enabled && ghUser) {
		const createdAt = new Date(ghUser.created_at as string);
		const now = new Date();
		const ageInDays = Math.floor(
			(now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24),
		);

		if (ageInDays < config.accountAge.days) {
			return {
				blocked: true,
				rule: "accountAge",
				reason: `Account @${ctx.senderLogin} is ${ageInDays} days old (minimum: ${config.accountAge.days} days).`,
			};
		}
	}

	// --- Minimum merged PRs ---
	if (config.minMergedPrs.enabled) {
		try {
			const count = await getMergedPrCount(token, ctx.senderLogin);
			if (count < config.minMergedPrs.count) {
				return {
					blocked: true,
					rule: "minMergedPrs",
					reason: `@${ctx.senderLogin} has ${count} merged PRs (minimum: ${config.minMergedPrs.count}).`,
				};
			}
		} catch {
			// Skip if API fails
		}
	}

	// --- Language requirement ---
	if (config.languageRequirement.enabled && contentText && contentText.length > 20) {
		const requiredLang = config.languageRequirement.language.toLowerCase();
		if (!isLikelyLanguage(contentText, requiredLang)) {
			return {
				blocked: true,
				rule: "languageRequirement",
				reason: `Content from @${ctx.senderLogin} does not appear to be in ${config.languageRequirement.language}.`,
			};
		}
	}

	// --- AI slop detection ---
	if (config.aiSlopDetection.enabled && contentText) {
		const slopMatch = detectAiSlop(contentText);
		if (slopMatch) {
			return {
				blocked: true,
				rule: "aiSlopDetection",
				reason: `Content from @${ctx.senderLogin} was flagged as AI-generated: ${slopMatch}`,
			};
		}
	}

	// --- Max PRs per day ---
	if (config.maxPrsPerDay.enabled) {
		try {
			const count = await countUserPrsToday(token, ctx.senderLogin, ctx.repoFullName);
			if (count >= config.maxPrsPerDay.limit) {
				return {
					blocked: true,
					rule: "maxPrsPerDay",
					reason: `@${ctx.senderLogin} has already opened ${count} PRs today (limit: ${config.maxPrsPerDay.limit}).`,
				};
			}
		} catch {
			// Skip if API fails
		}
	}

	// --- Max files changed (PR-only rule) ---
	if (config.maxFilesChanged.enabled && ctx.prNumber) {
		try {
			const [owner, repo] = ctx.repoFullName.split("/");
			const filesCount = await getPrFilesCount(token, owner, repo, ctx.prNumber);
			if (filesCount > config.maxFilesChanged.limit) {
				return {
					blocked: true,
					rule: "maxFilesChanged",
					reason: `This PR changes ${filesCount} files (limit: ${config.maxFilesChanged.limit}).`,
				};
			}
		} catch {
			// Skip if API fails
		}
	}

	// --- Repo activity minimum ---
	if (config.repoActivityMinimum.enabled) {
		try {
			const repoCount = await getUserPublicRepoCount(token, ctx.senderLogin);
			if (repoCount < config.repoActivityMinimum.minRepos) {
				return {
					blocked: true,
					rule: "repoActivityMinimum",
					reason: `@${ctx.senderLogin} has ${repoCount} public repos (minimum: ${config.repoActivityMinimum.minRepos}).`,
				};
			}
		} catch {
			// Skip if API fails
		}
	}

	// --- Require profile README ---
	if (config.requireProfileReadme.enabled) {
		try {
			const hasReadme = await hasProfileReadme(token, ctx.senderLogin);
			if (!hasReadme) {
				return {
					blocked: true,
					rule: "requireProfileReadme",
					reason: `@${ctx.senderLogin} does not have a profile README.`,
				};
			}
		} catch {
			// Skip if API fails
		}
	}

	return null; // All rules passed
}

/**
 * Handle a webhook event — run the pipeline and take action.
 */
export async function handlePullRequest(
	ctx: WebhookContext,
	prNumber: number,
	prTitle: string,
	prBody?: string,
) {
	// Add prNumber to context for PR-specific rules like maxFilesChanged
	const prCtx = { ...ctx, prNumber };
	const result = await runFilterPipeline(prCtx, prBody ?? prTitle);
	if (!result?.blocked) return;

	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	const comment = `> **Tripwire** — This PR was automatically closed.\n>\n> Reason: ${result.reason}`;

	await closePullRequest(token, owner, repo, prNumber, comment);

	// Log the event
	const [repoRow] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.githubRepoId, ctx.githubRepoId));

	if (repoRow) {
		await db.insert(events).values({
			repoId: repoRow.id,
			action: "pr_closed",
			ruleName: result.rule,
			targetGithubUsername: ctx.senderLogin,
			targetGithubUserId: ctx.senderId,
			githubRef: `#${prNumber}`,
			metadata: { title: prTitle, reason: result.reason },
		});
	}
}

export async function handleIssue(
	ctx: WebhookContext,
	issueNumber: number,
	issueTitle: string,
	issueBody?: string,
) {
	const result = await runFilterPipeline(ctx, issueBody ?? issueTitle);
	if (!result?.blocked) return;

	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	const comment = `> **Tripwire** — This issue was automatically closed.\n>\n> Reason: ${result.reason}`;

	await closeIssue(token, owner, repo, issueNumber, comment);

	const [repoRow] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.githubRepoId, ctx.githubRepoId));

	if (repoRow) {
		await db.insert(events).values({
			repoId: repoRow.id,
			action: "issue_deleted",
			ruleName: result.rule,
			targetGithubUsername: ctx.senderLogin,
			targetGithubUserId: ctx.senderId,
			githubRef: `#${issueNumber}`,
			metadata: { title: issueTitle, reason: result.reason },
		});
	}
}

export async function handleComment(
	ctx: WebhookContext,
	commentId: number,
	issueNumber: number,
	commentBody?: string,
) {
	const result = await runFilterPipeline(ctx, commentBody);
	if (!result?.blocked) return;

	const [owner, repo] = ctx.repoFullName.split("/");
	const token = await getInstallationToken(ctx.installationId);

	await deleteComment(token, owner, repo, commentId);

	const [repoRow] = await db
		.select()
		.from(repositories)
		.where(eq(repositories.githubRepoId, ctx.githubRepoId));

	if (repoRow) {
		await db.insert(events).values({
			repoId: repoRow.id,
			action: "comment_deleted",
			ruleName: result.rule,
			targetGithubUsername: ctx.senderLogin,
			targetGithubUserId: ctx.senderId,
			githubRef: `#${issueNumber}/comment/${commentId}`,
			metadata: { reason: result.reason },
		});
	}
}
