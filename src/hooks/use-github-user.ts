import { useQuery } from "@tanstack/react-query";
import { fetchGitHubUser, fetchUserRepos, formatAccountAge, formatNumber } from "#/utils/github";
import type { GitHubUser, GitHubRepository } from "#/types/github";

export interface GitHubUserProfile {
	username: string;
	name: string | null;
	avatar: string;
	location: string | null;
	bio: string | null;
	company: string | null;
	accountAge: string;
	publicRepos: number;
	followers: number;
	following: number;
	hasReadme: boolean;
	totalStars: number;
	url: string;
}

function transformToProfile(user: GitHubUser, repos: GitHubRepository[]): GitHubUserProfile {
	const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
	const hasReadme = repos.some((r) => r.name.toLowerCase() === user.login.toLowerCase());

	return {
		username: user.login,
		name: user.name,
		avatar: user.avatar_url,
		location: user.location,
		bio: user.bio,
		company: user.company,
		accountAge: formatAccountAge(user.created_at),
		publicRepos: user.public_repos,
		followers: user.followers,
		following: user.following,
		hasReadme,
		totalStars,
		url: user.html_url,
	};
}

export function useGitHubUser(username: string | undefined) {
	return useQuery({
		queryKey: ["github-user", username],
		queryFn: async () => {
			if (!username) throw new Error("Username required");
			const [user, repos] = await Promise.all([
				fetchGitHubUser(username),
				fetchUserRepos(username, 100),
			]);
			return transformToProfile(user, repos);
		},
		enabled: !!username,
		staleTime: 5 * 60 * 1000, // 5 minutes
		retry: 1,
	});
}

export function useGitHubUserFormatted(username: string | undefined) {
	const query = useGitHubUser(username);

	const formatted = query.data
		? {
				...query.data,
				followersFormatted: formatNumber(query.data.followers),
				publicReposFormatted: formatNumber(query.data.publicRepos),
				totalStarsFormatted: formatNumber(query.data.totalStars),
			}
		: null;

	return {
		...query,
		data: formatted,
	};
}
