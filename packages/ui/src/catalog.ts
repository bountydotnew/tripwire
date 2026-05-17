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
				bio: z.string().nullable(),
				company: z.string().nullable(),
				location: z.string().nullable(),
				publicRepos: z.number(),
				publicNonForkRepos: z.number(),
				publicForkRepos: z.number(),
				prsToThisRepo: z.number(),
				followers: z.number(),
				following: z.number(),
				accountAgeDays: z.number(),
				mergedPrs: z.number(),
				closedPrs: z.number(),
				closedUnmergedPrs: z.number(),
				hasProfileReadme: z.boolean(),
				hasTwoFactor: z.boolean(),
				// event breakdown
				blockedCount: z.number(),
				allowedCount: z.number(),
				nearMissCount: z.number(),
				// enriched (graphql)
				orgs: z.array(z.object({ login: z.string(), avatarUrl: z.string() })),
				sponsorsCount: z.number(),
				sponsoringCount: z.number(),
				achievements: z.array(z.object({ type: z.string(), tier: z.number() })),
				badges: z.array(z.string()),
				contributionsLastYear: z.number(),
				// score
				contributorScore: z.number(),
				status: z.enum(["normal", "blacklisted", "whitelisted"]),
			}),
			description:
				"Displays a GitHub user profile with enriched metrics and contributor score",
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

		// ─── Rule Config Card ─────────────────────────────────────────
		RuleConfigCard: {
			props: z.object({
				rules: z.array(
					z.object({
						id: z.string(),
						name: z.string(),
						enabled: z.boolean(),
						action: z.string(),
						detail: z.string().optional(),
					}),
				),
				enabledCount: z.number(),
				totalCount: z.number(),
			}),
			description: "Displays the rule configuration for a repository with enabled/disabled states and action levels",
		},

		// ─── Reputation Leaderboard ───────────────────────────────────
		ReputationLeaderboard: {
			props: z.object({
				users: z.array(z.object({
					username: z.string(),
					score: z.number(),
					totalBlocks: z.number(),
					totalAllows: z.number(),
					totalNearMisses: z.number(),
					lastSeenAt: z.string(),
				})),
			}),
			description: "Shows the most blocked GitHub users ranked by total blocks",
		},

		// ─── Score Breakdown ──────────────────────────────────────────
		ScoreBreakdown: {
			props: z.object({
				username: z.string(),
				total: z.number(),
				categories: z.array(
					z.object({
						id: z.enum([
							"globalReputation",
							"communitySignals",
							"repoHistory",
							"redFlags",
							"floor",
						]),
						label: z.string(),
						subtotal: z.number(),
						max: z.number().nullable(),
						items: z.array(
							z.object({
								reason: z.string(),
								delta: z.number(),
							}),
						),
					}),
				),
			}),
			description:
				"Explains a contributor score by listing every factor and its point delta, grouped by category",
		},

		// ─── Pull Request List ────────────────────────────────────────
		PullRequestList: {
			props: z.object({
				username: z.string(),
				prs: z.array(z.object({
					title: z.string(),
					number: z.number(),
					url: z.string(),
					repo: z.string(),
					state: z.string(),
					createdAt: z.string(),
					mergedAt: z.string().nullable(),
					labels: z.array(z.object({ name: z.string(), color: z.string() })),
					additions: z.number(),
					deletions: z.number(),
					changedFiles: z.number(),
					commits: z.number(),
					timeToMergeMinutes: z.number().nullable(),
				})),
				totalCount: z.number(),
				showing: z.number(),
			}),
			description: "Displays a list of GitHub pull requests with diff stats, timing, and metadata",
		},

		// ─── Single PR Detail ─────────────────────────────────────────
		PullRequestDetail: {
			props: z.object({
				title: z.string(),
				number: z.number(),
				url: z.string(),
				repo: z.string(),
				state: z.string(),
				author: z.string(),
				authorAvatar: z.string(),
				createdAt: z.string(),
				mergedAt: z.string().nullable(),
				additions: z.number(),
				deletions: z.number(),
				changedFiles: z.number(),
				commits: z.number(),
				timeToMergeMinutes: z.number().nullable(),
				draft: z.boolean(),
				body: z.string().nullable(),
				closedBy: z.string().nullable(),
				selfClosed: z.boolean().nullable(),
				labels: z.array(z.object({ name: z.string(), color: z.string() })),
				files: z.array(z.object({
					filename: z.string(),
					status: z.string(),
					additions: z.number(),
					deletions: z.number(),
				})),
				reviewers: z.array(z.object({
					login: z.string(),
					state: z.string(),
					avatarUrl: z.string(),
				})),
				commitMessages: z.array(z.string()),
				comments: z.array(z.object({
					author: z.string(),
					authorAvatar: z.string(),
					body: z.string(),
					createdAt: z.string(),
					type: z.enum(["comment", "review"]),
				})),
			}),
			description: "Full detail view of a single pull request with files, reviewers, commits, comments, and diff stats",
		},

		// ─── Comment Thread ───────────────────────────────────────────
		CommentThread: {
			props: z.object({
				repo: z.string(),
				issueNumber: z.number(),
				comments: z.array(z.object({
					author: z.string(),
					authorAvatar: z.string(),
					body: z.string(),
					createdAt: z.string(),
					type: z.enum(["comment", "review"]),
				})),
				totalCount: z.number(),
			}),
			description: "Displays a comment thread from a GitHub issue or pull request, with markdown rendering",
		},

		// ─── Repository List ──────────────────────────────────────────
		RepoList: {
			props: z.object({
				username: z.string(),
				repos: z.array(z.object({
					name: z.string(),
					fullName: z.string(),
					url: z.string(),
					description: z.string().nullable(),
					stars: z.number(),
					forks: z.number(),
					language: z.string().nullable(),
					isFork: z.boolean(),
					createdAt: z.string(),
					updatedAt: z.string(),
					pushedAt: z.string().nullable(),
					openIssuesCount: z.number(),
					topics: z.array(z.string()),
					license: z.string().nullable(),
					archived: z.boolean(),
				})),
				totalCount: z.number(),
				showing: z.number(),
			}),
			description: "Displays a list of GitHub repositories with stars, language, timestamps, and metadata",
		},

		// ─── Activity Summary ─────────────────────────────────────────
		ActivitySummary: {
			props: z.object({
				totalContributions: z.number(),
				contributionYears: z.array(z.number()),
				pinned: z.array(z.object({
					name: z.string(),
					url: z.string(),
					description: z.string().nullable(),
					stars: z.number(),
					language: z.string().nullable(),
				})),
				orgs: z.array(z.object({ login: z.string(), avatarUrl: z.string() })),
			}),
			description: "Shows a GitHub user's contribution activity summary",
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
