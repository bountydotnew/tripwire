import type { GitHubUser, GitHubRepository, GitHubEvent, UserProfileData } from "#/types/github";

const GITHUB_API = "https://api.github.com";

const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function fetchWithCache<T>(url: string, options?: RequestInit): Promise<T> {
	const cached = cache.get(url);
	if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
		return cached.data as T;
	}

	const response = await fetch(url, {
		...options,
		headers: {
			Accept: "application/vnd.github.v3+json",
			...options?.headers,
		},
	});

	if (!response.ok) {
		throw new Error(`GitHub API error: ${response.status}`);
	}

	const data = await response.json();
	cache.set(url, { data, timestamp: Date.now() });
	return data;
}

export async function fetchGitHubUser(username: string): Promise<GitHubUser> {
	return fetchWithCache<GitHubUser>(`${GITHUB_API}/users/${username}`);
}

export async function fetchUserRepos(username: string, limit = 30): Promise<GitHubRepository[]> {
	return fetchWithCache<GitHubRepository[]>(
		`${GITHUB_API}/users/${username}/repos?sort=updated&per_page=${limit}`
	);
}

export async function fetchUserEvents(username: string, limit = 30): Promise<GitHubEvent[]> {
	return fetchWithCache<GitHubEvent[]>(
		`${GITHUB_API}/users/${username}/events/public?per_page=${limit}`
	);
}

export async function fetchUserProfileData(username: string): Promise<UserProfileData> {
	const [user, repos, recentActivity] = await Promise.all([
		fetchGitHubUser(username),
		fetchUserRepos(username),
		fetchUserEvents(username),
	]);

	return {
		user,
		repos,
		recentActivity,
		contributionStats: null, // GraphQL API needed for contribution stats
	};
}

export function formatAccountAge(createdAt: string): string {
	const created = new Date(createdAt);
	const now = new Date();
	const years = now.getFullYear() - created.getFullYear();
	const months = now.getMonth() - created.getMonth();
	const totalMonths = years * 12 + months;

	if (totalMonths < 1) return "< 1 month";
	if (totalMonths < 12) return `${totalMonths} month${totalMonths === 1 ? "" : "s"}`;
	if (years < 2) return `${years} year, ${months} month${months === 1 ? "" : "s"}`;
	return `${years} years`;
}

export function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
	return num.toString();
}

export function clearCache(): void {
	cache.clear();
}
