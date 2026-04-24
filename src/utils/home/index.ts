import type { User } from "#/types/home";

export function createUserFromUsername(username: string): User {
	return {
		username,
		name: username,
		avatar: `https://github.com/${username}.png`,
		accountAge: "Unknown",
		publicRepos: 0,
		followers: 0,
		mergedPrs: 0,
		readme: false,
		tint: "#888",
	};
}
