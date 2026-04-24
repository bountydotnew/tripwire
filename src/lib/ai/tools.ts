import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { db } from "#/db";
import {
	events,
	whitelistEntries,
	blacklistEntries,
	type EventAction,
} from "#/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { logEvent } from "#/lib/events";

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
});

export const getListsDef = toolDefinition({
	name: "get_lists",
	description:
		"Show all users currently on the blacklist and whitelist for this repository. Use this when the user asks to see the lists, view blocked users, or check who is blacklisted/whitelisted.",
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
});

// ─── Tool Factory ───────────────────────────────────────────────

interface ToolContext {
	userId: string;
	userName: string;
	repoId: string;
}

async function fetchGitHubUser(username: string) {
	const res = await fetch(`https://api.github.com/users/${username}`, {
		headers: {
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "Tripwire",
		},
	});

	if (!res.ok) {
		throw new Error(`GitHub user @${username} not found`);
	}

	return res.json();
}

export function createTripwireTools(ctx: ToolContext) {
	const { repoId, userId, userName } = ctx;

	return [
		// ─── Lookup User ────────────────────────────────────────
		lookupUserDef.server(async ({ username }) => {
			const ghUser = await fetchGitHubUser(username);

			const [, whitelist, blacklist] = await Promise.all([
				db
					.select()
					.from(events)
					.where(
						and(
							eq(events.repoId, repoId),
							usernameEq(events.targetGithubUsername, username),
						),
					)
					.orderBy(desc(events.createdAt))
					.limit(5),
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

			const allEvents = await db
				.select()
				.from(events)
				.where(
					and(
						eq(events.repoId, repoId),
						usernameEq(events.targetGithubUsername, username),
					),
				);

			const status = blacklist.length > 0
				? "blacklisted"
				: whitelist.length > 0
					? "whitelisted"
					: "normal";

			return makeSpec("UserCard", {
				username: ghUser.login,
				name: ghUser.name,
				avatar: ghUser.avatar_url,
				publicRepos: ghUser.public_repos,
				followers: ghUser.followers,
				tripwireEventCount: allEvents.length,
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
	];
}
