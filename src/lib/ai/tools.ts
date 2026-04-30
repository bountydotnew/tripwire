import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { db } from "#/db";
import {
	events,
	whitelistEntries,
	blacklistEntries,
	ruleConfigs,
	repositories,
	organizations,
	githubReputation,
	DEFAULT_RULE_CONFIG,
	type EventAction,
	type RuleConfig,
	type RuleAction,
} from "#/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logEvent } from "#/lib/events";
import {
	getMergedPrCount,
	getClosedPrCount,
	getPublicNonForkRepoCount,
	getPublicForkRepoCount,
	getContextRepoPrCount,
	hasProfileReadme,
	fetchUserGraphQL,
	fetchUserAchievements,
	getInstallationToken,
} from "#/lib/github/github-api";
import { computeContributorScore } from "#/lib/ai/contributor-score";

// ─── Helpers ────────────────────────────────────────────────────

/** Case-insensitive username comparison */
function usernameEq(column: unknown, username: string) {
	return sql`lower(${column}) = ${username.toLowerCase()}`;
}

// ─── JSON Render Spec Schema ─────────────────────────────────────
// All tools return a json-render spec with flat element map

const specSchema = z.object({
	root: z.string(),
	elements: z.record(
		z.string(),
		z.object({
			type: z.string(),
			props: z.record(z.string(), z.unknown()),
			children: z.array(z.string()).optional(),
		}),
	),
});

/** Helper to create a simple single-element spec */
function makeSpec(type: string, props: Record<string, unknown>) {
	return {
		root: "main",
		elements: {
			main: { type, props, children: [] },
		},
	};
}

// ─── Tool Definitions ───────────────────────────────────────────

export const lookupUserDef = toolDefinition({
	name: "lookup_user",
	description:
		"Look up a GitHub user's profile and their Tripwire activity history. Use this when asked about a specific user. Pass the username without the @ symbol.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
});

export const getEventDef = toolDefinition({
	name: "get_event",
	description: "Get details about a specific Tripwire event by its UUID.",
	inputSchema: z.object({
		eventId: z.string(),
	}),
	outputSchema: specSchema,
	lazy: true,
});

export const listEventsDef = toolDefinition({
	name: "list_events",
	description:
		"List recent Tripwire events with optional filters. Use this to understand activity patterns. You can filter by username, action type (pipeline_blocked, rule_near_miss, etc.), or severity level.",
	inputSchema: z.object({
		username: z.string().optional(),
		action: z.string().optional(),
		severity: z.enum(["info", "warning", "error", "success"]).optional(),
		limit: z.number().min(1).max(20).optional(),
	}),
	outputSchema: specSchema,
	lazy: true,
});

export const getListsDef = toolDefinition({
	name: "get_lists",
	description:
		"Show all users on BOTH the blacklist and whitelist. Use when the user asks to see 'the lists' or wants an overview of both.",
	inputSchema: z.object({}),
	outputSchema: specSchema,
});

export const getBlacklistDef = toolDefinition({
	name: "get_blacklist",
	description:
		"Show only the blacklisted users. Use when the user specifically asks about the blacklist.",
	inputSchema: z.object({}),
	outputSchema: specSchema,
});

export const getWhitelistDef = toolDefinition({
	name: "get_whitelist",
	description:
		"Show only the whitelisted users. Use when the user specifically asks about the whitelist.",
	inputSchema: z.object({}),
	outputSchema: specSchema,
});

export const checkListsDef = toolDefinition({
	name: "check_lists",
	description:
		"Check if a SPECIFIC user is on the whitelist or blacklist. Requires a username. Use get_lists instead if the user wants to see all entries.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
});

export const addToBlacklistDef = toolDefinition({
	name: "add_to_blacklist",
	description:
		"Add a GitHub user to the blacklist. All their future contributions will be automatically blocked. Pass the username without the @ symbol.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const removeFromBlacklistDef = toolDefinition({
	name: "remove_from_blacklist",
	description:
		"Remove a GitHub user from the blacklist. Pass the username without the @ symbol.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const addToWhitelistDef = toolDefinition({
	name: "add_to_whitelist",
	description:
		"Add a GitHub user to the whitelist. They will bypass all rule checks. Pass the username without the @ symbol.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const removeFromWhitelistDef = toolDefinition({
	name: "remove_from_whitelist",
	description:
		"Remove a GitHub user from the whitelist. Pass the username without the @ symbol.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const moveToWhitelistDef = toolDefinition({
	name: "move_to_whitelist",
	description:
		"Move a user from the blacklist to the whitelist in one action. Use this when user asks to unblock someone AND whitelist them, or move them between lists.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
	lazy: true,
});

export const moveToBlacklistDef = toolDefinition({
	name: "move_to_blacklist",
	description:
		"Move a user from the whitelist to the blacklist in one action. Use this when user asks to remove whitelist AND block someone.",
	inputSchema: z.object({
		username: z.string(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
	lazy: true,
});

// ─── Rule Config Tools ──────────────────────────────────────────

const RULE_NAMES: Record<string, string> = {
	aiSlopDetection: "AI Slop Detection",
languageRequirement: "Language Requirement",
	minMergedPrs: "Minimum Merged PRs",
	accountAge: "Account Age",
	maxPrsPerDay: "Max PRs Per Day",
	maxFilesChanged: "Max Files Changed",
	repoActivityMinimum: "Repo Activity Minimum",
	requireProfileReadme: "Require Profile README",
	cryptoAddressDetection: "Crypto Address Detection",
};

function getRuleDetail(ruleId: string, config: Record<string, unknown>): string | undefined {
	if (ruleId === "languageRequirement" && config.language) return `${config.language}`;
	if (ruleId === "minMergedPrs" && config.count != null) return `${config.count} PRs`;
	if (ruleId === "accountAge" && config.days != null) return `${config.days} days`;
	if (ruleId === "maxPrsPerDay" && config.limit != null) return `${config.limit}/day`;
	if (ruleId === "maxFilesChanged" && config.limit != null) return `${config.limit} files`;
	if (ruleId === "repoActivityMinimum" && config.minRepos != null) return `${config.minRepos} repos`;
	return undefined;
}

const VALID_RULE_IDS = Object.keys(DEFAULT_RULE_CONFIG).join(", ");

export const getRuleConfigDef = toolDefinition({
	name: "get_rule_config",
	description:
		"Get the current rule configuration for this repository. Shows which rules are enabled, their action levels (block/warn/log/threshold), and their settings.",
	inputSchema: z.object({}),
	outputSchema: specSchema,
});

export const toggleRuleDef = toolDefinition({
	name: "toggle_rule",
	description:
		`Enable or disable a specific rule. Valid ruleIds: ${VALID_RULE_IDS}.`,
	inputSchema: z.object({
		ruleId: z.string(),
		enabled: z.boolean(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const updateRuleActionDef = toolDefinition({
	name: "update_rule_action",
	description:
		`Change a rule's action level. Actions: 'block' (close PR/issue), 'warn' (leave comment), 'log' (record silently), 'threshold' (ignore until N violations then block). Valid ruleIds: ${VALID_RULE_IDS}.`,
	inputSchema: z.object({
		ruleId: z.string(),
		action: z.enum(["block", "warn", "log", "threshold"]),
		thresholdCount: z.number().optional(),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const updateRuleValueDef = toolDefinition({
	name: "update_rule_value",
	description:
		`Set a rule's numeric or string parameter. Valid fields per rule: minMergedPrs.count, accountAge.days, maxPrsPerDay.limit, maxFilesChanged.limit, repoActivityMinimum.minRepos, languageRequirement.language. Valid ruleIds: ${VALID_RULE_IDS}.`,
	inputSchema: z.object({
		ruleId: z.string().meta({ description: "The rule ID (e.g. 'minMergedPrs', 'accountAge')" }),
		field: z.string().meta({ description: "The field to update (e.g. 'count', 'days', 'limit', 'minRepos', 'language')" }),
		value: z.union([z.number(), z.string()]).meta({ description: "The new value" }),
	}),
	outputSchema: specSchema,
	needsApproval: true,
});

export const getReputationLeaderboardDef = toolDefinition({
	name: "get_reputation_leaderboard",
	description:
		"Show the most blocked GitHub users across all events. Returns users ranked by total blocks with their reputation scores. Use when asked about repeat offenders, most blocked users, or threat analysis.",
	inputSchema: z.object({
		limit: z.number().min(1).max(25).optional().meta({ description: "Number of users to return (default 10)" }),
	}),
	outputSchema: specSchema,
	lazy: true,
});

// ─── Tool Factory ───────────────────────────────────────────────

interface ToolContext {
	userId: string;
	userName: string;
	repoId: string;
}

async function fetchGitHubUser(username: string, token?: string) {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github.v3+json",
		"User-Agent": "Tripwire",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(`https://api.github.com/users/${username}`, { headers });

	if (!res.ok) {
		throw new Error(`GitHub user @${username} not found`);
	}

	return res.json();
}

async function getTokenForRepo(repoId: string): Promise<string | null> {
	try {
		const [repo] = await db
			.select({ orgId: repositories.orgId })
			.from(repositories)
			.where(eq(repositories.id, repoId))
			.limit(1);
		if (!repo) return null;

		const [org] = await db
			.select({ installationId: organizations.githubInstallationId })
			.from(organizations)
			.where(eq(organizations.id, repo.orgId))
			.limit(1);
		if (!org) return null;

		return await getInstallationToken(org.installationId);
	} catch {
		return null;
	}
}

export function createTripwireTools(ctx: ToolContext) {
	const { repoId, userId, userName } = ctx;

	return [
		// ─── Lookup User ────────────────────────────────────────
		lookupUserDef.server(async ({ username }) => {
			// Get installation token for authenticated API calls
			const token = await getTokenForRepo(repoId);

			const [repoRow] = await db
				.select({ fullName: repositories.fullName })
				.from(repositories)
				.where(eq(repositories.id, repoId))
				.limit(1);
			const contextRepoFullName = repoRow?.fullName ?? "";

			// Fetch all data in parallel
			const [
				ghUser,
				whitelist,
				blacklist,
				allEvents,
				mergedPrs,
				closedPrs,
				publicNonForkRepos,
				publicForkRepos,
				prsToThisRepo,
				profileReadme,
				graphqlData,
				achievements,
			] = await Promise.all([
				fetchGitHubUser(username, token ?? undefined),
				db.select().from(whitelistEntries).where(and(eq(whitelistEntries.repoId, repoId), usernameEq(whitelistEntries.githubUsername, username))).limit(1),
				db.select().from(blacklistEntries).where(and(eq(blacklistEntries.repoId, repoId), usernameEq(blacklistEntries.githubUsername, username))).limit(1),
				db.select().from(events).where(and(eq(events.repoId, repoId), usernameEq(events.targetGithubUsername, username))),
				token ? getMergedPrCount(token, username).catch(() => 0) : Promise.resolve(0),
				token ? getClosedPrCount(token, username).catch(() => 0) : Promise.resolve(0),
				token ? getPublicNonForkRepoCount(token, username).catch(() => 0) : Promise.resolve(0),
				token ? getPublicForkRepoCount(token, username).catch(() => 0) : Promise.resolve(0),
				token && contextRepoFullName
					? getContextRepoPrCount(token, username, contextRepoFullName).catch(() => 0)
					: Promise.resolve(0),
				token ? hasProfileReadme(token, username).catch(() => false) : Promise.resolve(false),
				token ? fetchUserGraphQL(token, username).catch(() => null) : Promise.resolve(null),
				fetchUserAchievements(username).catch(() => []),
			]);

			const closedUnmergedPrs = Math.max(0, closedPrs - mergedPrs);

			// Event breakdown
			const blockedCount = allEvents.filter((e) => e.action === "pipeline_blocked").length;
			const allowedCount = allEvents.filter((e) => e.action === "pipeline_allowed").length;
			const nearMissCount = allEvents.filter((e) => e.action === "rule_near_miss").length;

			// Account age
			const createdAt = ghUser.created_at ? new Date(ghUser.created_at) : new Date();
			const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);

			// Contributor score
			const score = computeContributorScore({
				accountAgeDays,
				followers: ghUser.followers ?? 0,
				following: ghUser.following ?? 0,
				publicRepos: ghUser.public_repos ?? 0,
				publicNonForkRepoCount: publicNonForkRepos,
				publicForkRepoCount: publicForkRepos,
				contextRepoPrCount: prsToThisRepo,
				publicGists: ghUser.public_gists ?? 0,
				bio: ghUser.bio ?? null,
				company: ghUser.company ?? null,
				location: ghUser.location ?? null,
				blog: ghUser.blog ?? null,
				twitterUsername: ghUser.twitter_username ?? null,
				hasTwoFactor: ghUser.two_factor_authentication ?? false,
				hasProfileReadme: profileReadme,
				graphql: graphqlData,
				achievements,
				mergedPrCount: mergedPrs,
				closedPrCount: closedPrs,
				closedUnmergedPrCount: closedUnmergedPrs,
				blockedCount,
				allowedCount,
				nearMissCount,
			});

			// Collect badges from GraphQL data
			const badges: string[] = [];
			if (graphqlData?.isGitHubStar) badges.push("GitHub Star");
			if (graphqlData?.isBountyHunter) badges.push("Bug Bounty Hunter");
			if (graphqlData?.isDeveloperProgramMember) badges.push("Dev Program");
			if (graphqlData?.isCampusExpert) badges.push("Campus Expert");
			if (graphqlData?.isSiteAdmin) badges.push("GitHub Staff");

			const status = blacklist.length > 0 ? "blacklisted" : whitelist.length > 0 ? "whitelisted" : "normal";

			return makeSpec("UserCard", {
				username: ghUser.login,
				name: ghUser.name ?? null,
				avatar: ghUser.avatar_url ?? null,
				bio: ghUser.bio ?? null,
				company: ghUser.company ?? null,
				location: ghUser.location ?? null,
				publicRepos: ghUser.public_repos ?? 0,
				publicNonForkRepos: publicNonForkRepos,
				publicForkRepos: publicForkRepos,
				prsToThisRepo,
				followers: ghUser.followers ?? 0,
				following: ghUser.following ?? 0,
				accountAgeDays,
				mergedPrs: mergedPrs,
				closedPrs: closedPrs,
				closedUnmergedPrs: closedUnmergedPrs,
				hasProfileReadme: profileReadme,
				hasTwoFactor: ghUser.two_factor_authentication ?? false,
				blockedCount,
				allowedCount,
				nearMissCount,
				orgs: graphqlData?.organizations ?? [],
				sponsorsCount: graphqlData?.sponsorsCount ?? 0,
				sponsoringCount: graphqlData?.sponsoringCount ?? 0,
				achievements,
				badges,
				contributionsLastYear: graphqlData?.contributionsLastYear ?? 0,
				contributorScore: score.total,
				status,
			});
		}),

		// ─── Get Event ──────────────────────────────────────────
		getEventDef.server(async ({ eventId }) => {
			const [event] = await db
				.select()
				.from(events)
				.where(and(eq(events.id, eventId), eq(events.repoId, repoId)))
				.limit(1);

			if (!event) {
				throw new Error("Event not found");
			}

			return makeSpec("EventCard", {
				id: event.id,
				action: event.action,
				severity: (event.severity ?? "info") as "info" | "warning" | "error",
				description: event.description ?? "",
				date: event.createdAt.toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				}),
				username: event.targetGithubUsername,
			});
		}),

		// ─── List Events ────────────────────────────────────────
		listEventsDef.server(async ({ username, action, severity, limit }) => {
			const conditions = [eq(events.repoId, repoId)];

			if (username) {
				conditions.push(usernameEq(events.targetGithubUsername, username));
			}
			if (action) {
				conditions.push(eq(events.action, action as EventAction));
			}
			if (severity) {
				conditions.push(eq(events.severity, severity));
			}

			const queryLimit = limit ?? 10;

			const rows = await db
				.select()
				.from(events)
				.where(and(...conditions))
				.orderBy(desc(events.createdAt))
				.limit(queryLimit);

			return makeSpec("EventsList", {
				title: "Recent Events",
				events: rows.map((e) => ({
					id: e.id,
					action: e.action,
					severity: (e.severity ?? "info") as "info" | "warning" | "error",
					description: e.description ?? "",
					date: e.createdAt.toLocaleDateString("en-US", {
						month: "long",
						day: "numeric",
						year: "numeric",
					}),
					username: e.targetGithubUsername,
				})),
			});
		}),

		// ─── Get Lists ──────────────────────────────────────────
		getListsDef.server(async () => {
			const [blacklist, whitelist] = await Promise.all([
				db
					.select()
					.from(blacklistEntries)
					.where(eq(blacklistEntries.repoId, repoId))
					.orderBy(desc(blacklistEntries.createdAt)),
				db
					.select()
					.from(whitelistEntries)
					.where(eq(whitelistEntries.repoId, repoId))
					.orderBy(desc(whitelistEntries.createdAt)),
			]);

			return makeSpec("ListsOverview", {
				blacklist: blacklist.map((e) => ({
					username: e.githubUsername,
					avatar: e.avatarUrl,
					addedAt: e.createdAt.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					}),
				})),
				whitelist: whitelist.map((e) => ({
					username: e.githubUsername,
					avatar: e.avatarUrl,
					addedAt: e.createdAt.toLocaleDateString("en-US", {
						month: "short",
						day: "numeric",
						year: "numeric",
					}),
				})),
			});
		}),

		// ─── Get Blacklist ──────────────────────────────────────
		getBlacklistDef.server(async () => {
			const blacklist = await db
				.select()
				.from(blacklistEntries)
				.where(eq(blacklistEntries.repoId, repoId))
				.orderBy(desc(blacklistEntries.createdAt));

			return makeSpec("ListsOverview", {
				blacklist: blacklist.map((e) => ({
					username: e.githubUsername,
					avatar: e.avatarUrl,
					addedAt: e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
				})),
				whitelist: [],
			});
		}),

		// ─── Get Whitelist ──────────────────────────────────────
		getWhitelistDef.server(async () => {
			const whitelist = await db
				.select()
				.from(whitelistEntries)
				.where(eq(whitelistEntries.repoId, repoId))
				.orderBy(desc(whitelistEntries.createdAt));

			return makeSpec("ListsOverview", {
				blacklist: [],
				whitelist: whitelist.map((e) => ({
					username: e.githubUsername,
					avatar: e.avatarUrl,
					addedAt: e.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
				})),
			});
		}),

		// ─── Check Lists ────────────────────────────────────────
		checkListsDef.server(async ({ username }) => {
			const [whitelist, blacklist] = await Promise.all([
				db
					.select()
					.from(whitelistEntries)
					.where(
						and(
							eq(whitelistEntries.repoId, repoId),
							usernameEq(whitelistEntries.githubUsername, username),
						),
					)
					.limit(1),
				db
					.select()
					.from(blacklistEntries)
					.where(
						and(
							eq(blacklistEntries.repoId, repoId),
							usernameEq(blacklistEntries.githubUsername, username),
						),
					)
					.limit(1),
			]);

			return makeSpec("ListsStatus", {
				username,
				isBlacklisted: blacklist.length > 0,
				isWhitelisted: whitelist.length > 0,
				blacklistReason: null,
				whitelistReason: null,
			});
		}),

		// ─── Add to Blacklist ───────────────────────────────────
		addToBlacklistDef.server(async ({ username }) => {
			const ghUser = await fetchGitHubUser(username);

			const [whitelisted] = await db
				.select()
				.from(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						eq(whitelistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (whitelisted) {
				return makeSpec("ActionResult", {
					success: false,
					message: `@${ghUser.login} is on the whitelist. Remove them from the whitelist first.`,
					action: "add_to_blacklist",
				});
			}

			const [existing] = await db
				.select()
				.from(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						eq(blacklistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (existing) {
				return makeSpec("ActionResult", {
					success: false,
					message: `@${ghUser.login} is already on the blacklist.`,
					action: "add_to_blacklist",
				});
			}

			await db.insert(blacklistEntries).values({
				repoId,
				githubUsername: ghUser.login,
				githubUserId: ghUser.id,
				avatarUrl: ghUser.avatar_url,
				addedById: userId,
			});

			await logEvent({
				repoId,
				action: "blacklist_added",
				severity: "warning",
				description: `@${ghUser.login} was added to the blacklist by AI assistant`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: userName, viaAI: true },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${ghUser.login} has been added to the blacklist. All their future contributions will be blocked.`,
				action: "add_to_blacklist",
			});
		}),

		// ─── Remove from Blacklist ──────────────────────────────
		removeFromBlacklistDef.server(async ({ username }) => {
			await db
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						usernameEq(blacklistEntries.githubUsername, username),
					),
				);

			await logEvent({
				repoId,
				action: "blacklist_removed",
				severity: "info",
				description: `@${username} was removed from the blacklist by AI assistant`,
				targetGithubUsername: username,
				metadata: { removedBy: userName, viaAI: true },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${username} has been removed from the blacklist.`,
				action: "remove_from_blacklist",
			});
		}),

		// ─── Add to Whitelist ───────────────────────────────────
		addToWhitelistDef.server(async ({ username }) => {
			const ghUser = await fetchGitHubUser(username);

			const [blacklisted] = await db
				.select()
				.from(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						eq(blacklistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (blacklisted) {
				return makeSpec("ActionResult", {
					success: false,
					message: `@${ghUser.login} is on the blacklist. Remove them from the blacklist first.`,
					action: "add_to_whitelist",
				});
			}

			const [existing] = await db
				.select()
				.from(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						eq(whitelistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (existing) {
				return makeSpec("ActionResult", {
					success: false,
					message: `@${ghUser.login} is already on the whitelist.`,
					action: "add_to_whitelist",
				});
			}

			await db.insert(whitelistEntries).values({
				repoId,
				githubUsername: ghUser.login,
				githubUserId: ghUser.id,
				avatarUrl: ghUser.avatar_url,
				addedById: userId,
			});

			await logEvent({
				repoId,
				action: "whitelist_added",
				severity: "info",
				description: `@${ghUser.login} was added to the whitelist by AI assistant`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: userName, viaAI: true },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${ghUser.login} has been added to the whitelist. They will bypass all rule checks.`,
				action: "add_to_whitelist",
			});
		}),

		// ─── Remove from Whitelist ──────────────────────────────
		removeFromWhitelistDef.server(async ({ username }) => {
			await db
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						usernameEq(whitelistEntries.githubUsername, username),
					),
				);

			await logEvent({
				repoId,
				action: "whitelist_removed",
				severity: "info",
				description: `@${username} was removed from the whitelist by AI assistant`,
				targetGithubUsername: username,
				metadata: { removedBy: userName, viaAI: true },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${username} has been removed from the whitelist.`,
				action: "remove_from_whitelist",
			});
		}),

		// ─── Move to Whitelist ──────────────────────────────────
		moveToWhitelistDef.server(async ({ username }) => {
			const ghUser = await fetchGitHubUser(username);

			// Remove from blacklist if present
			await db
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						usernameEq(blacklistEntries.githubUsername, username),
					),
				);

			// Check if already whitelisted
			const [existing] = await db
				.select()
				.from(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						eq(whitelistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (!existing) {
				await db.insert(whitelistEntries).values({
					repoId,
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					addedById: userId,
				});
			}

			await logEvent({
				repoId,
				action: "whitelist_added",
				severity: "info",
				description: `@${ghUser.login} was moved to the whitelist by AI assistant`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: userName, viaAI: true, movedFrom: "blacklist" },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${ghUser.login} has been moved to the whitelist.`,
				action: "move_to_whitelist",
			});
		}),

		// ─── Move to Blacklist ──────────────────────────────────
		moveToBlacklistDef.server(async ({ username }) => {
			const ghUser = await fetchGitHubUser(username);

			// Remove from whitelist if present
			await db
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						usernameEq(whitelistEntries.githubUsername, username),
					),
				);

			// Check if already blacklisted
			const [existing] = await db
				.select()
				.from(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						eq(blacklistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (!existing) {
				await db.insert(blacklistEntries).values({
					repoId,
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					addedById: userId,
				});
			}

			await logEvent({
				repoId,
				action: "blacklist_added",
				severity: "warning",
				description: `@${ghUser.login} was moved to the blacklist by AI assistant`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: userName, viaAI: true, movedFrom: "whitelist" },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `@${ghUser.login} has been moved to the blacklist. All their future contributions will be blocked.`,
				action: "move_to_blacklist",
			});
		}),

		// ─── Get Rule Config ────────────────────────────────────
		getRuleConfigDef.server(async () => {
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, repoId))
				.limit(1);

			const config = (configRow?.config ?? DEFAULT_RULE_CONFIG) as RuleConfig;
			const entries = Object.entries(config) as [string, any][];

			let enabledCount = 0;
			const rules = entries.map(([id, rule]) => {
				if (rule.enabled) enabledCount++;
				return {
					id,
					name: RULE_NAMES[id] ?? id,
					enabled: rule.enabled,
					action: rule.action,
					detail: getRuleDetail(id, rule),
				};
			});

			return makeSpec("RuleConfigCard", {
				rules,
				enabledCount,
				totalCount: rules.length,
			});
		}),

		// ─── Toggle Rule ────────────────────────────────────────
		toggleRuleDef.server(async ({ ruleId, enabled }) => {
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, repoId))
				.limit(1);

			const config = { ...(configRow?.config ?? DEFAULT_RULE_CONFIG) } as Record<string, Record<string, unknown>>;

			if (!(ruleId in config)) {
				return makeSpec("ActionResult", {
					success: false,
					message: `Unknown rule: ${ruleId}`,
					action: "toggle_rule",
				});
			}

			config[ruleId] = { ...config[ruleId], enabled };

			if (configRow) {
				await db
					.update(ruleConfigs)
					.set({ config, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, repoId));
			} else {
				await db.insert(ruleConfigs).values({ repoId, config });
			}

			const ruleName = RULE_NAMES[ruleId] ?? ruleId;

			await logEvent({
				repoId,
				action: "rule_config_updated",
				severity: "info",
				description: `${ruleName} ${enabled ? "enabled" : "disabled"} by AI assistant`,
				metadata: { updatedBy: userName, viaAI: true, ruleId, enabled },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `${ruleName} has been ${enabled ? "enabled" : "disabled"}.`,
				action: "toggle_rule",
			});
		}),

		// ─── Update Rule Action ─────────────────────────────────
		updateRuleActionDef.server(async ({ ruleId, action, thresholdCount }) => {
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, repoId))
				.limit(1);

			const config = { ...(configRow?.config ?? DEFAULT_RULE_CONFIG) } as Record<string, Record<string, unknown>>;

			if (!(ruleId in config)) {
				return makeSpec("ActionResult", {
					success: false,
					message: `Unknown rule: ${ruleId}`,
					action: "update_rule_action",
				});
			}

			config[ruleId] = {
				...config[ruleId],
				action,
				...(action === "threshold" && thresholdCount ? { thresholdCount } : {}),
			};

			if (configRow) {
				await db
					.update(ruleConfigs)
					.set({ config, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, repoId));
			} else {
				await db.insert(ruleConfigs).values({ repoId, config });
			}

			const ruleName = RULE_NAMES[ruleId] ?? ruleId;

			await logEvent({
				repoId,
				action: "rule_config_updated",
				severity: "info",
				description: `${ruleName} action changed to ${action} by AI assistant`,
				metadata: { updatedBy: userName, viaAI: true, ruleId, action, thresholdCount },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `${ruleName} action set to ${action}.${action === "threshold" && thresholdCount ? ` Threshold: ${thresholdCount} violations.` : ""}`,
				action: "update_rule_action",
			});
		}),

		// ─── Update Rule Value ──────────────────────────────────
		updateRuleValueDef.server(async ({ ruleId, field, value }) => {
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, repoId))
				.limit(1);

			const config = { ...(configRow?.config ?? DEFAULT_RULE_CONFIG) } as Record<string, Record<string, unknown>>;

			if (!(ruleId in config)) {
				return makeSpec("ActionResult", {
					success: false,
					message: `Unknown rule: ${ruleId}`,
					action: "update_rule_value",
				});
			}

			// Don't allow setting core fields via this tool
			if (field === "enabled" || field === "action") {
				return makeSpec("ActionResult", {
					success: false,
					message: `Use the toggle_rule or update_rule_action tools to change '${field}'.`,
					action: "update_rule_value",
				});
			}

			config[ruleId] = { ...config[ruleId], [field]: value };

			if (configRow) {
				await db
					.update(ruleConfigs)
					.set({ config, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, repoId));
			} else {
				await db.insert(ruleConfigs).values({ repoId, config });
			}

			const ruleName = RULE_NAMES[ruleId] ?? ruleId;

			await logEvent({
				repoId,
				action: "rule_config_updated",
				severity: "info",
				description: `${ruleName} ${field} set to ${value} by AI assistant`,
				metadata: { updatedBy: userName, viaAI: true, ruleId, field, value },
			});

			return makeSpec("ActionResult", {
				success: true,
				message: `${ruleName} ${field} set to ${value}.`,
				action: "update_rule_value",
			});
		}),

		// ─── Reputation Leaderboard ─────────────────────────────
		getReputationLeaderboardDef.server(async ({ limit }) => {
			const rows = await db
				.select()
				.from(githubReputation)
				.where(sql`${githubReputation.totalBlocks} > 0`)
				.orderBy(desc(githubReputation.totalBlocks))
				.limit(limit ?? 10);

			return makeSpec("ReputationLeaderboard", {
				users: rows.map((r) => ({
					username: r.githubUsername,
					score: r.score,
					totalBlocks: r.totalBlocks,
					totalAllows: r.totalAllows,
					totalNearMisses: r.totalNearMisses,
					lastSeenAt: r.lastSeenAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
				})),
			});
		}),
	];
}
