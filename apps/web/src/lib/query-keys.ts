/**
 * Centralized query key factory for non-tRPC queries.
 *
 * tRPC auto-generates keys for its procedures via .queryKey().
 * This covers the gaps: GitHub public data, custom fetches, etc.
 *
 * Convention: keys are lowercase arrays, scoped by domain.
 * Normalise handles/usernames to lowercase so mixed-case URLs
 * share one cache entry.
 */

export const qk = {
	github: {
		user: (username: string) =>
			["github", "user", username.toLowerCase()] as const,
		repos: (username: string) =>
			["github", "repos", username.toLowerCase()] as const,
		contributions: (username: string) =>
			["github", "contributions", username.toLowerCase()] as const,
		pinned: (username: string) =>
			["github", "pinned", username.toLowerCase()] as const,
		achievements: (username: string) =>
			["github", "achievements", username.toLowerCase()] as const,
		/** Composite profile (user + repos + readme check) */
		profile: (username: string) =>
			["github", "profile", username.toLowerCase()] as const,
	},

	workspace: {
		repos: (baOrgId: string) => ["workspace", "repos", baOrgId] as const,
	},

	eventsUnread: (repoId: string) =>
		["events", "unread", repoId] as const,
} as const;
