import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { createError } from "evlog";
import { db } from "@tripwire/db/client";
import {
	blacklistEntries,
	repositories,
	organizations,
	whitelistEntries,
} from "@tripwire/db";
import { assertRepoOwner } from '@tripwire/core';
import { logEvent } from '@tripwire/core';
import { getInstallationToken } from '@tripwire/github';
import { resetContributorScore } from '@tripwire/core';
import {
	type AnyToolDefinition,
	defineTool,
	makeSpec,
} from "../registry";
import { requireRepoId } from "../helpers";
function usernameEq(column: unknown, username: string) {
	return sql`lower(${column}) = ${username.toLowerCase()}`;
}

async function fetchGitHubUser(
	username: string,
	token?: string,
): Promise<{ login: string; id: number; avatar_url: string }> {
	const headers: Record<string, string> = {
		Accept: "application/vnd.github.v3+json",
		"User-Agent": "Tripwire",
	};
	if (token) headers.Authorization = `Bearer ${token}`;

	const res = await fetch(`https://api.github.com/users/${username}`, { headers });
	if (!res.ok) {
		throw createError({
			code: "github.user_not_found",
			status: 404,
			message: `GitHub user @${username} not found`,
			internal: { username, githubStatus: res.status },
		});
	}
	return res.json() as Promise<{ login: string; id: number; avatar_url: string }>;
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

const fmtDate = (d: Date) =>
	d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
const listLists = defineTool({
	name: "list_lists",
	description: "Return both the whitelist and blacklist for the current repo.",
	inputSchema: z.object({}),
	handler: async (_args, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
		const [whitelist, blacklist] = await Promise.all([
			db
				.select()
				.from(whitelistEntries)
				.where(eq(whitelistEntries.repoId, repoId))
				.orderBy(desc(whitelistEntries.createdAt)),
			db
				.select()
				.from(blacklistEntries)
				.where(eq(blacklistEntries.repoId, repoId))
				.orderBy(desc(blacklistEntries.createdAt)),
		]);
		return { whitelist, blacklist };
	},
	chatRender: ({ whitelist, blacklist }) =>
		makeSpec("ListsOverview", {
			blacklist: blacklist.map((e) => ({
				username: e.githubUsername,
				avatar: e.avatarUrl,
				addedAt: fmtDate(e.createdAt),
			})),
			whitelist: whitelist.map((e) => ({
				username: e.githubUsername,
				avatar: e.avatarUrl,
				addedAt: fmtDate(e.createdAt),
			})),
		}),
});

// Chat-only convenience tools — model the UI's "show me just the blacklist"
// flow without bouncing through list_lists.

const getBlacklist = defineTool({
	name: "get_blacklist",
	description:
		"Show only the blacklisted users for the current repo. Use when the user specifically asks about the blacklist.",
	surfaces: ["chat"],
	inputSchema: z.object({}),
	handler: async (_args, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
		return db
			.select()
			.from(blacklistEntries)
			.where(eq(blacklistEntries.repoId, repoId))
			.orderBy(desc(blacklistEntries.createdAt));
	},
	chatRender: (rows) =>
		makeSpec("ListsOverview", {
			whitelist: [],
			blacklist: rows.map((e) => ({
				username: e.githubUsername,
				avatar: e.avatarUrl,
				addedAt: fmtDate(e.createdAt),
			})),
		}),
});

const getWhitelist = defineTool({
	name: "get_whitelist",
	description:
		"Show only the whitelisted users for the current repo. Use when the user specifically asks about the whitelist.",
	surfaces: ["chat"],
	inputSchema: z.object({}),
	handler: async (_args, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
		return db
			.select()
			.from(whitelistEntries)
			.where(eq(whitelistEntries.repoId, repoId))
			.orderBy(desc(whitelistEntries.createdAt));
	},
	chatRender: (rows) =>
		makeSpec("ListsOverview", {
			blacklist: [],
			whitelist: rows.map((e) => ({
				username: e.githubUsername,
				avatar: e.avatarUrl,
				addedAt: fmtDate(e.createdAt),
			})),
		}),
});

const checkLists = defineTool({
	name: "check_lists",
	description:
		"Check whether a SPECIFIC user is on the whitelist or blacklist. Use this when the user asks about one person; use list_lists for a full overview.",
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
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
		return {
			username,
			isBlacklisted: blacklist.length > 0,
			isWhitelisted: whitelist.length > 0,
		};
	},
	chatRender: (output) =>
		makeSpec("ListsStatus", {
			username: output.username,
			isBlacklisted: output.isBlacklisted,
			isWhitelisted: output.isWhitelisted,
			blacklistReason: null,
			whitelistReason: null,
		}),
});
const addToBlacklist = defineTool({
	name: "add_to_blacklist",
	description:
		"Add a GitHub user to the current repo's blacklist. Removes any existing whitelist entry for the same user in the same transaction.",
	needsApproval: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);

		const token = await getTokenForRepo(repoId);
		const ghUser = await fetchGitHubUser(username, token ?? undefined).catch(() => null);
		const targetLogin = ghUser?.login ?? username;
		const targetUserId = ghUser?.id;
		const avatarUrl = ghUser?.avatar_url;

		const inserted = await db.transaction(async (tx) => {
			await tx
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						usernameEq(whitelistEntries.githubUsername, targetLogin),
					),
				);
			const [row] = await tx
				.insert(blacklistEntries)
				.values({
					repoId,
					githubUsername: targetLogin,
					githubUserId: targetUserId,
					avatarUrl,
					addedById: ctx.userId,
				})
				.onConflictDoNothing()
				.returning();
			return row;
		});

		if (!inserted) {
			return {
				ok: false,
				message: `@${targetLogin} is already on the blacklist.`,
			};
		}

		await logEvent({
			repoId,
			action: "blacklist_added",
			severity: "warning",
			description: `@${targetLogin} added to blacklist`,
			targetGithubUsername: targetLogin,
			targetGithubUserId: targetUserId,
			metadata: { addedBy: ctx.userName ?? null, viaTool: true },
		});

		return {
			ok: true,
			message: `@${targetLogin} has been added to the blacklist. All their future contributions will be blocked.`,
			data: { entry: inserted },
		};
	},
});

const removeFromBlacklist = defineTool({
	name: "remove_from_blacklist",
	description: "Remove a GitHub user from the current repo's blacklist.",
	needsApproval: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
		const deleted = await db
			.delete(blacklistEntries)
			.where(
				and(
					eq(blacklistEntries.repoId, repoId),
					usernameEq(blacklistEntries.githubUsername, username),
				),
			)
			.returning();

		if (deleted.length === 0) {
			return {
				ok: false,
				message: `@${username} is not on the blacklist.`,
			};
		}

		await logEvent({
			repoId,
			action: "blacklist_removed",
			severity: "info",
			description: `@${username} removed from blacklist`,
			targetGithubUsername: username,
			metadata: { removedBy: ctx.userName ?? null, viaTool: true },
		});

		return {
			ok: true,
			message: `@${username} has been removed from the blacklist.`,
		};
	},
});

const addToWhitelist = defineTool({
	name: "add_to_whitelist",
	description:
		"Add a GitHub user to the current repo's whitelist. Rejects if the user is on the blacklist (remove first).",
	needsApproval: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);

		const token = await getTokenForRepo(repoId);
		const ghUser = await fetchGitHubUser(username, token ?? undefined).catch(() => null);
		const targetLogin = ghUser?.login ?? username;
		const targetUserId = ghUser?.id;
		const avatarUrl = ghUser?.avatar_url;

		const [blocked] = await db
			.select({ id: blacklistEntries.id })
			.from(blacklistEntries)
			.where(
				and(
					eq(blacklistEntries.repoId, repoId),
					usernameEq(blacklistEntries.githubUsername, targetLogin),
				),
			)
			.limit(1);
		if (blocked) {
			return {
				ok: false,
				message: `@${targetLogin} is on the blacklist for this repo. Remove from blacklist before whitelisting.`,
			};
		}

		const [inserted] = await db
			.insert(whitelistEntries)
			.values({
				repoId,
				githubUsername: targetLogin,
				githubUserId: targetUserId,
				avatarUrl,
				addedById: ctx.userId,
			})
			.onConflictDoNothing()
			.returning();

		if (!inserted) {
			return {
				ok: false,
				message: `@${targetLogin} is already on the whitelist.`,
			};
		}

		await logEvent({
			repoId,
			action: "whitelist_added",
			severity: "info",
			description: `@${targetLogin} added to whitelist`,
			targetGithubUsername: targetLogin,
			targetGithubUserId: targetUserId,
			metadata: { addedBy: ctx.userName ?? null, viaTool: true },
		});

		return {
			ok: true,
			message: `@${targetLogin} has been added to the whitelist. They will bypass all rule checks.`,
			data: { entry: inserted },
		};
	},
});

const removeFromWhitelist = defineTool({
	name: "remove_from_whitelist",
	description: "Remove a GitHub user from the current repo's whitelist.",
	needsApproval: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);
		const deleted = await db
			.delete(whitelistEntries)
			.where(
				and(
					eq(whitelistEntries.repoId, repoId),
					usernameEq(whitelistEntries.githubUsername, username),
				),
			)
			.returning();

		if (deleted.length === 0) {
			return {
				ok: false,
				message: `@${username} is not on the whitelist.`,
			};
		}

		await logEvent({
			repoId,
			action: "whitelist_removed",
			severity: "info",
			description: `@${username} removed from whitelist`,
			targetGithubUsername: username,
			metadata: { removedBy: ctx.userName ?? null, viaTool: true },
		});

		return {
			ok: true,
			message: `@${username} has been removed from the whitelist.`,
		};
	},
});
const moveToWhitelist = defineTool({
	name: "move_to_whitelist",
	description:
		"Move a user from the blacklist to the whitelist in one action. Use when the user asks to unblock AND whitelist.",
	surfaces: ["chat"],
	needsApproval: true,
	lazy: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);

		const token = await getTokenForRepo(repoId);
		const ghUser = await fetchGitHubUser(username, token ?? undefined).catch(() => null);
		const targetLogin = ghUser?.login ?? username;
		const targetUserId = ghUser?.id;
		const avatarUrl = ghUser?.avatar_url;

		const inserted = await db.transaction(async (tx) => {
			await tx
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						usernameEq(blacklistEntries.githubUsername, targetLogin),
					),
				);
			const rows = await tx
				.insert(whitelistEntries)
				.values({
					repoId,
					githubUsername: targetLogin,
					githubUserId: targetUserId,
					avatarUrl,
					addedById: ctx.userId,
				})
				.onConflictDoNothing()
				.returning({ id: whitelistEntries.id });
			return rows.length > 0;
		});

		await logEvent({
			repoId,
			action: "whitelist_added",
			severity: "info",
			description: `@${targetLogin} moved to whitelist`,
			targetGithubUsername: targetLogin,
			targetGithubUserId: targetUserId,
			metadata: {
				addedBy: ctx.userName ?? null,
				viaTool: true,
				movedFrom: "blacklist",
				alreadyOnList: !inserted,
			},
		});

		return {
			ok: true,
			message: inserted
				? `@${targetLogin} has been moved to the whitelist.`
				: `@${targetLogin} was already on the whitelist; removed from the blacklist.`,
		};
	},
});

const moveToBlacklist = defineTool({
	name: "move_to_blacklist",
	description:
		"Move a user from the whitelist to the blacklist in one action. Use when the user asks to remove from whitelist AND block.",
	surfaces: ["chat"],
	needsApproval: true,
	lazy: true,
	inputSchema: z.object({ username: z.string().min(1) }),
	handler: async ({ username }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);

		const token = await getTokenForRepo(repoId);
		const ghUser = await fetchGitHubUser(username, token ?? undefined).catch(() => null);
		const targetLogin = ghUser?.login ?? username;
		const targetUserId = ghUser?.id;
		const avatarUrl = ghUser?.avatar_url;

		const inserted = await db.transaction(async (tx) => {
			await tx
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						usernameEq(whitelistEntries.githubUsername, targetLogin),
					),
				);
			const rows = await tx
				.insert(blacklistEntries)
				.values({
					repoId,
					githubUsername: targetLogin,
					githubUserId: targetUserId,
					avatarUrl,
					addedById: ctx.userId,
				})
				.onConflictDoNothing()
				.returning({ id: blacklistEntries.id });
			return rows.length > 0;
		});

		await logEvent({
			repoId,
			action: "blacklist_added",
			severity: "warning",
			description: `@${targetLogin} moved to blacklist`,
			targetGithubUsername: targetLogin,
			targetGithubUserId: targetUserId,
			metadata: {
				addedBy: ctx.userName ?? null,
				viaTool: true,
				movedFrom: "whitelist",
				alreadyOnList: !inserted,
			},
		});

		return {
			ok: true,
			message: inserted
				? `@${targetLogin} has been moved to the blacklist. All their future contributions will be blocked.`
				: `@${targetLogin} was already on the blacklist; removed from the whitelist.`,
		};
	},
});
const resetContributorScoreTool = defineTool({
	name: "reset_contributor_score",
	description:
		"Forgive a GitHub user's accumulated Tripwire history for this repo. Zeros their reputation totals (blocks/allows/near-misses) and stamps a reset timestamp so future score_breakdown / lookup_user calls ignore older events. The audit events themselves are preserved.",
	needsApproval: true,
	inputSchema: z.object({
		username: z.string().min(1),
		reason: z.string().optional(),
	}),
	handler: async ({ username, reason }, ctx) => {
		const repoId = requireRepoId(ctx);
		await assertRepoOwner(ctx.userId, repoId);

		const token = await getTokenForRepo(repoId);
		const ghUser = await fetchGitHubUser(username, token ?? undefined).catch(() => null);

		const result = await resetContributorScore({
			repoId,
			userId: ctx.userId,
			username: ghUser?.login ?? username,
			githubUserId: ghUser?.id,
			reason,
		});

		return {
			ok: result.ok,
			message: result.message,
			data: {
				resetAt: result.resetAt.toISOString(),
				previousTotals: result.previousTotals,
			},
		};
	},
});

export const listTools: AnyToolDefinition[] = [
	listLists,
	getBlacklist,
	getWhitelist,
	checkLists,
	addToBlacklist,
	removeFromBlacklist,
	addToWhitelist,
	removeFromWhitelist,
	moveToWhitelist,
	moveToBlacklist,
	resetContributorScoreTool,
];
