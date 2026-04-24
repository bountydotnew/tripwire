import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { db } from "#/db";
import {
	events,
	whitelistEntries,
	blacklistEntries,
	type EventAction,
} from "#/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logEvent } from "#/lib/events";

// ─── JSON Render Spec Schema ─────────────────────────────────────
// All tools return a json-render spec with a root element

const specSchema = z.object({
	root: z.object({
		type: z.string(),
		props: z.record(z.string(), z.unknown()),
		children: z.array(z.unknown()).optional(),
	}),
});

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

export const checkListsDef = toolDefinition({
	name: "check_lists",
	description:
		"Check if a user is on the whitelist or blacklist for this repository.",
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
							eq(events.targetGithubUsername, username),
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
							eq(whitelistEntries.githubUsername, username),
						),
					)
					.limit(1),
				db
					.select()
					.from(blacklistEntries)
					.where(
						and(
							eq(blacklistEntries.repoId, repoId),
							eq(blacklistEntries.githubUsername, username),
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
						eq(events.targetGithubUsername, username),
					),
				);

			const status = blacklist.length > 0
				? "blacklisted"
				: whitelist.length > 0
					? "whitelisted"
					: "normal";

			return {
				root: {
					type: "UserCard",
					props: {
						username: ghUser.login,
						name: ghUser.name,
						avatar: ghUser.avatar_url,
						publicRepos: ghUser.public_repos,
						followers: ghUser.followers,
						tripwireEventCount: allEvents.length,
						status,
					},
				},
			};
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

			return {
				root: {
					type: "EventCard",
					props: {
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
					},
				},
			};
		}),

		// ─── List Events ────────────────────────────────────────
		listEventsDef.server(async ({ username, action, severity, limit }) => {
			const conditions = [eq(events.repoId, repoId)];

			if (username) {
				conditions.push(eq(events.targetGithubUsername, username));
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

			return {
				root: {
					type: "EventsList",
					props: {
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
					},
				},
			};
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
							eq(whitelistEntries.githubUsername, username),
						),
					)
					.limit(1),
				db
					.select()
					.from(blacklistEntries)
					.where(
						and(
							eq(blacklistEntries.repoId, repoId),
							eq(blacklistEntries.githubUsername, username),
						),
					)
					.limit(1),
			]);

			return {
				root: {
					type: "ListsStatus",
					props: {
						username,
						isBlacklisted: blacklist.length > 0,
						isWhitelisted: whitelist.length > 0,
						blacklistReason: null,
						whitelistReason: null,
					},
				},
			};
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
				return {
					root: {
						type: "ActionResult",
						props: {
							success: false,
							message: `@${ghUser.login} is already on the blacklist.`,
							action: "add_to_blacklist",
						},
					},
				};
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

			return {
				root: {
					type: "ActionResult",
					props: {
						success: true,
						message: `@${ghUser.login} has been added to the blacklist. All their future contributions will be blocked.`,
						action: "add_to_blacklist",
					},
				},
			};
		}),

		// ─── Remove from Blacklist ──────────────────────────────
		removeFromBlacklistDef.server(async ({ username }) => {
			await db
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, repoId),
						eq(blacklistEntries.githubUsername, username),
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

			return {
				root: {
					type: "ActionResult",
					props: {
						success: true,
						message: `@${username} has been removed from the blacklist.`,
						action: "remove_from_blacklist",
					},
				},
			};
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
				return {
					root: {
						type: "ActionResult",
						props: {
							success: false,
							message: `@${ghUser.login} is on the blacklist. Remove them from the blacklist first.`,
							action: "add_to_whitelist",
						},
					},
				};
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
				return {
					root: {
						type: "ActionResult",
						props: {
							success: false,
							message: `@${ghUser.login} is already on the whitelist.`,
							action: "add_to_whitelist",
						},
					},
				};
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

			return {
				root: {
					type: "ActionResult",
					props: {
						success: true,
						message: `@${ghUser.login} has been added to the whitelist. They will bypass all rule checks.`,
						action: "add_to_whitelist",
					},
				},
			};
		}),

		// ─── Remove from Whitelist ──────────────────────────────
		removeFromWhitelistDef.server(async ({ username }) => {
			await db
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, repoId),
						eq(whitelistEntries.githubUsername, username),
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

			return {
				root: {
					type: "ActionResult",
					props: {
						success: true,
						message: `@${username} has been removed from the whitelist.`,
						action: "remove_from_whitelist",
					},
				},
			};
		}),
	];
}
