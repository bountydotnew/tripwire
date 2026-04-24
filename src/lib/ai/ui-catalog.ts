import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react/schema";
import { z } from "zod";

/**
 * UI Catalog for AI tool results
 * Defines the components the AI can use to render structured responses
 */
export const catalog = defineCatalog(schema, {
	actions: {},
	components: {
		// ─── User Profile Card ────────────────────────────────────────
		UserCard: {
			props: z.object({
				username: z.string(),
				name: z.string().nullable(),
				avatar: z.string().nullable(),
				publicRepos: z.number(),
				followers: z.number(),
				tripwireEventCount: z.number(),
				status: z.enum(["normal", "blacklisted", "whitelisted"]),
			}),
			description:
				"Displays a GitHub user profile with stats and Tripwire status",
		},

		// ─── Events List ──────────────────────────────────────────────
		EventsList: {
			props: z.object({
				events: z.array(
					z.object({
						id: z.string(),
						action: z.string(),
						severity: z.enum(["info", "warning", "error"]),
						description: z.string(),
						date: z.string(),
						username: z.string().nullable(),
					}),
				),
				title: z.string().optional(),
			}),
			description: "Displays a list of Tripwire events with severity indicators",
		},

		// ─── Single Event Card ────────────────────────────────────────
		EventCard: {
			props: z.object({
				id: z.string(),
				action: z.string(),
				severity: z.enum(["info", "warning", "error"]),
				description: z.string(),
				date: z.string(),
				username: z.string().nullable(),
			}),
			description: "Displays a single event with full details",
		},

		// ─── Action Result ────────────────────────────────────────────
		ActionResult: {
			props: z.object({
				success: z.boolean(),
				message: z.string(),
				action: z.string().optional(),
			}),
			description:
				"Shows the result of an action (blacklist/whitelist add/remove)",
		},

		// ─── Lists Status ─────────────────────────────────────────────
		ListsStatus: {
			props: z.object({
				username: z.string(),
				isBlacklisted: z.boolean(),
				isWhitelisted: z.boolean(),
				blacklistReason: z.string().nullable(),
				whitelistReason: z.string().nullable(),
			}),
			description: "Shows a user's blacklist/whitelist status",
		},

		// ─── Lists Overview ───────────────────────────────────────────
		ListsOverview: {
			props: z.object({
				blacklist: z.array(
					z.object({
						username: z.string(),
						avatar: z.string().nullable(),
						addedAt: z.string(),
					}),
				),
				whitelist: z.array(
					z.object({
						username: z.string(),
						avatar: z.string().nullable(),
						addedAt: z.string(),
					}),
				),
			}),
			description: "Shows all users on the blacklist and whitelist",
		},

		// ─── Text Block ───────────────────────────────────────────────
		Text: {
			props: z.object({
				content: z.string(),
				variant: z.enum(["default", "muted", "error", "success"]).optional(),
			}),
			description: "Simple text block for messages",
		},

		// ─── Info Row ─────────────────────────────────────────────────
		InfoRow: {
			props: z.object({
				label: z.string(),
				value: z.string(),
			}),
			description: "Label-value pair for displaying data",
		},

		// ─── Container ────────────────────────────────────────────────
		Card: {
			props: z.object({
				title: z.string().optional(),
			}),
			description: "Container card that can hold other components",
		},

		// ─── Stack ────────────────────────────────────────────────────
		Stack: {
			props: z.object({
				gap: z.enum(["sm", "md", "lg"]).optional(),
			}),
			description: "Vertical stack layout for grouping components",
		},
	},
});

export type Catalog = typeof catalog;
