/**
 * GitHub API client using GitHub App installation access tokens.
 *
 * Auth flow:
 * 1. Sign a JWT with the App's private key (RS256)
 * 2. Exchange JWT for an installation access token
 * 3. Cache until expires_at
 */

import { SignJWT, importPKCS8 } from "jose";
import * as crypto from "crypto";

// Cache installation tokens: installationId -> { token, expiresAt }
const tokenCache = new Map<number, { token: string; expiresAt: number }>();

/**
 * Create a JWT signed with the GitHub App's private key.
 */
async function createAppJwt(): Promise<string> {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

	if (!appId || !privateKey) {
		throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
	}

	// The private key may have literal \n in env vars — normalize
	let normalizedKey = privateKey.replace(/\\n/g, "\n");

	// Convert PKCS#1 (RSA PRIVATE KEY) to PKCS#8 (PRIVATE KEY) if needed
	// GitHub generates keys in PKCS#1 format, but jose expects PKCS#8
	if (normalizedKey.includes("BEGIN RSA PRIVATE KEY")) {
		const keyObject = crypto.createPrivateKey(normalizedKey);
		normalizedKey = keyObject.export({ type: "pkcs8", format: "pem" }) as string;
	}

	const key = await importPKCS8(normalizedKey, "RS256");

	const now = Math.floor(Date.now() / 1000);
	return new SignJWT({})
		.setProtectedHeader({ alg: "RS256" })
		.setIssuer(appId)
		.setIssuedAt(now)
		.setExpirationTime(now + 9 * 60) // 9 min (GitHub max is 10)
		.sign(key);
}

/**
 * Delete (uninstall) a GitHub App installation.
 * Uses the App JWT directly, not an installation token.
 */
export async function deleteInstallation(installationId: number): Promise<void> {
	const jwt = await createAppJwt();
	const res = await fetch(
		`https://api.github.com/app/installations/${installationId}`,
		{
			method: "DELETE",
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: "application/vnd.github.v3+json",
			},
		},
	);
	if (!res.ok && res.status !== 404) {
		console.error(`[github] Failed to delete installation ${installationId}: ${res.status}`);
	}
}

/**
 * Get an installation access token for a GitHub App installation.
 * Caches tokens until 5 minutes before expiry.
 */
export async function getInstallationToken(
	installationId: number,
): Promise<string> {
	// Check cache
	const cached = tokenCache.get(installationId);
	if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
		return cached.token;
	}

	const jwt = await createAppJwt();

	const res = await fetch(
		`https://api.github.com/app/installations/${installationId}/access_tokens`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				Accept: "application/vnd.github+json",
				"X-GitHub-Api-Version": "2022-11-28",
			},
		},
	);

	if (!res.ok) {
		const text = await res.text();
		throw new Error(
			`Failed to get installation token (${res.status}): ${text}`,
		);
	}

	const data = (await res.json()) as { token: string; expires_at: string };

	tokenCache.set(installationId, {
		token: data.token,
		expiresAt: new Date(data.expires_at).getTime(),
	});

	return data.token;
}

export async function githubApi(
	endpoint: string,
	token: string,
	options: RequestInit = {},
) {
	const res = await fetch(`https://api.github.com${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${token}`,
			Accept: "application/vnd.github+json",
			"X-GitHub-Api-Version": "2022-11-28",
			...options.headers,
		},
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`GitHub API ${res.status}: ${text}`);
	}

	// Some responses (like DELETE) return empty body
	const text = await res.text();
	if (!text) return null;
	return JSON.parse(text);
}

/** Close a pull request */
export async function closePullRequest(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
	comment?: string,
) {
	// Post comment first so it appears in the timeline
	if (comment) {
		console.log(`[GitHub] Posting comment to PR #${prNumber}...`);
		try {
			await githubApi(
				`/repos/${owner}/${repo}/issues/${prNumber}/comments`,
				token,
				{
					method: "POST",
					body: JSON.stringify({ body: comment }),
				},
			);
			console.log(`[GitHub] ✓ Comment posted to PR #${prNumber}`);
		} catch (err) {
			console.error(`[GitHub] ✗ Failed to post comment:`, err);
		}
	}

	console.log(`[GitHub] Closing PR #${prNumber}...`);
	return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`, token, {
		method: "PATCH",
		body: JSON.stringify({ state: "closed" }),
	});
}

/** Add a comment to an issue or PR (without closing) */
export async function addComment(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	body: string,
) {
	return githubApi(
		`/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
		token,
		{
			method: "POST",
			body: JSON.stringify({ body }),
		},
	);
}

/** Delete a comment */
export async function deleteComment(
	token: string,
	owner: string,
	repo: string,
	commentId: number,
) {
	return githubApi(
		`/repos/${owner}/${repo}/issues/comments/${commentId}`,
		token,
		{ method: "DELETE" },
	);
}

/** Close an issue */
export async function closeIssue(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	comment?: string,
) {
	// Post comment first so it appears in the timeline
	if (comment) {
		console.log(`[GitHub] Posting comment to issue #${issueNumber}...`);
		try {
			await githubApi(
				`/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
				token,
				{
					method: "POST",
					body: JSON.stringify({ body: comment }),
				},
			);
			console.log(`[GitHub] ✓ Comment posted to issue #${issueNumber}`);
		} catch (err) {
			console.error(`[GitHub] ✗ Failed to post comment:`, err);
		}
	}

	console.log(`[GitHub] Closing issue #${issueNumber}...`);
	return githubApi(`/repos/${owner}/${repo}/issues/${issueNumber}`, token, {
		method: "PATCH",
		body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
	});
}

/** Get a user's public profile */
export async function getUser(token: string, username: string) {
	return githubApi(`/users/${username}`, token);
}

/** Search a user's merged PRs count */
export async function getMergedPrCount(
	token: string,
	username: string,
): Promise<number> {
	const result = await githubApi(
		`/search/issues?q=author:${username}+type:pr+is:merged&per_page=1`,
		token,
	);
	return result.total_count;
}

/** Search a user's closed PR count (merged + closed without merge) */
export async function getClosedPrCount(
	token: string,
	username: string,
): Promise<number> {
	const result = await githubApi(
		`/search/issues?q=author:${username}+type:pr+is:closed&per_page=1`,
		token,
	);
	return result.total_count;
}

/** Public non-fork repos owned by user (repository search) */
export async function getPublicNonForkRepoCount(
	token: string,
	username: string,
): Promise<number> {
	const q = encodeURIComponent(`user:${username} fork:false is:public`);
	const result = await githubApi(`/search/repositories?q=${q}&per_page=1`, token);
	return (result as { total_count: number }).total_count;
}

/** Public fork repos owned by user (repository search) */
export async function getPublicForkRepoCount(
	token: string,
	username: string,
): Promise<number> {
	const q = encodeURIComponent(`user:${username} fork:true is:public`);
	const result = await githubApi(`/search/repositories?q=${q}&per_page=1`, token);
	return (result as { total_count: number }).total_count;
}

/** All PRs (open + closed) authored by user on a specific repo */
export async function getContextRepoPrCount(
	token: string,
	username: string,
	repoFullName: string,
): Promise<number> {
	const q = encodeURIComponent(`author:${username} type:pr repo:${repoFullName}`);
	const result = await githubApi(`/search/issues?q=${q}&per_page=1`, token);
	return (result as { total_count: number }).total_count;
}

/** Count PRs opened by a user today in a specific repo */
export async function countUserPrsToday(
	token: string,
	username: string,
	repoFullName: string,
): Promise<number> {
	const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
	const result = await githubApi(
		`/search/issues?q=author:${username}+type:pr+repo:${repoFullName}+created:>=${today}&per_page=1`,
		token,
	);
	return result.total_count;
}

/** Get the number of files changed in a PR */
export async function getPrFilesCount(
	token: string,
	owner: string,
	repo: string,
	prNumber: number,
): Promise<number> {
	const pr = await githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`, token);
	return pr.changed_files;
}

/** Get a user's public repo count */
export async function getUserPublicRepoCount(
	token: string,
	username: string,
): Promise<number> {
	const user = await githubApi(`/users/${username}`, token);
	return user.public_repos;
}

/** Get a collaborator's permission level on a repo */
export async function getCollaboratorPermission(
	token: string,
	repoFullName: string,
	username: string,
): Promise<string> {
	try {
		const result = await githubApi(
			`/repos/${repoFullName}/collaborators/${username}/permission`,
			token,
		);
		return result?.permission ?? "none";
	} catch {
		return "none";
	}
}

/** Check if user has a profile README (username/username repo with README) */
export async function hasProfileReadme(
	token: string,
	username: string,
): Promise<boolean> {
	try {
		await githubApi(`/repos/${username}/${username}/readme`, token);
		return true;
	} catch {
		return false;
	}
}

/** Enriched user data from GraphQL API */
export interface GitHubUserGraphQL {
	hasSponsorsListing: boolean;
	isBountyHunter: boolean;
	isCampusExpert: boolean;
	isDeveloperProgramMember: boolean;
	isGitHubStar: boolean;
	isHireable: boolean;
	isSiteAdmin: boolean;
	sponsoringCount: number;
	sponsorsCount: number;
	contributionYears: number[];
	contributionsLastYear: number;
	organizations: Array<{ login: string; avatarUrl: string }>;
	socialAccounts: Array<{ provider: string; url: string }>;
	topRepositories: Array<{ name: string; stars: number; language: string | null }>;
}

/** Fetch enriched user data via GitHub GraphQL API */
export async function fetchUserGraphQL(
	token: string,
	username: string,
): Promise<GitHubUserGraphQL | null> {
	const query = `query($login: String!) {
		user(login: $login) {
			hasSponsorsListing
			isBountyHunter
			isCampusExpert
			isDeveloperProgramMember
			isGitHubStar
			isHireable
			isSiteAdmin
			sponsoring(first: 0) { totalCount }
			sponsors(first: 0) { totalCount }
			contributionsCollection {
				contributionCalendar { totalContributions }
				contributionYears
			}
			organizations(first: 10) {
				nodes { login avatarUrl }
			}
			socialAccounts(first: 10) {
				nodes { provider url }
			}
			topRepositories(first: 5, orderBy: { field: STARGAZERS, direction: DESC }) {
				nodes { name stargazerCount primaryLanguage { name } }
			}
		}
	}`;

	try {
		const res = await fetch("https://api.github.com/graphql", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query, variables: { login: username } }),
		});

		if (!res.ok) return null;
		const json = await res.json();
		const u = json.data?.user;
		if (!u) return null;

		return {
			hasSponsorsListing: u.hasSponsorsListing ?? false,
			isBountyHunter: u.isBountyHunter ?? false,
			isCampusExpert: u.isCampusExpert ?? false,
			isDeveloperProgramMember: u.isDeveloperProgramMember ?? false,
			isGitHubStar: u.isGitHubStar ?? false,
			isHireable: u.isHireable ?? false,
			isSiteAdmin: u.isSiteAdmin ?? false,
			sponsoringCount: u.sponsoring?.totalCount ?? 0,
			sponsorsCount: u.sponsors?.totalCount ?? 0,
			contributionYears: u.contributionsCollection?.contributionYears ?? [],
			contributionsLastYear: u.contributionsCollection?.contributionCalendar?.totalContributions ?? 0,
			organizations: (u.organizations?.nodes ?? []).map((o: { login: string; avatarUrl: string }) => ({
				login: o.login,
				avatarUrl: o.avatarUrl,
			})),
			socialAccounts: (u.socialAccounts?.nodes ?? []).map((s: { provider: string; url: string }) => ({
				provider: s.provider,
				url: s.url,
			})),
			topRepositories: (u.topRepositories?.nodes ?? []).map((r: { name: string; stargazerCount: number; primaryLanguage?: { name: string } | null }) => ({
				name: r.name,
				stars: r.stargazerCount ?? 0,
				language: r.primaryLanguage?.name ?? null,
			})),
		};
	} catch {
		return null;
	}
}

/** Achievement from GitHub profile */
export interface GitHubAchievement {
	type: string;
	tier: number;
}

/** Fetch user achievements by scraping GitHub profile HTML */
export async function fetchUserAchievements(
	username: string,
): Promise<GitHubAchievement[]> {
	try {
		const res = await fetch(`https://github.com/${username}?tab=achievements`, {
			headers: { "User-Agent": "Tripwire" },
		});
		if (!res.ok) return [];

		const html = await res.text();
		const { parseHTML } = await import("linkedom");
		const { document } = parseHTML(html);

		const cards = document.querySelectorAll(".js-achievement-card-details");
		const achievements: GitHubAchievement[] = [];

		for (const card of cards) {
			const type = (card as any).dataset?.achievementSlug;
			if (!type) continue;
			const tierLabel = card.querySelector(".achievement-tier-label")?.textContent?.trim();
			const tier = tierLabel ? Number.parseInt(tierLabel.replace("x", ""), 10) || 1 : 1;
			achievements.push({ type, tier });
		}

		return achievements.sort((a, b) => b.tier - a.tier);
	} catch {
		return [];
	}
}
