/**
 * Contributor trust score (0-100) based on GitHub profile signals,
 * Tripwire event history, and community standing.
 *
 * Four categories:
 * - repoFamiliarity (0-35): tripwire event history, allowed/blocked ratio
 * - communityStanding (0-25): account age, followers, bio, orgs, 2FA
 * - ossPresence (0-20): repos, merged PRs, sponsors, achievements, badges
 * - trustSignal (0-20): blocked ratio, social accounts, profile completeness
 */

import type { GitHubAchievement, GitHubUserGraphQL } from "#/lib/github/github-api";

export interface ScoreInput {
	// profile
	accountAgeDays: number;
	followers: number;
	following: number;
	publicRepos: number;
	publicGists: number;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	twitterUsername: string | null;
	hasTwoFactor: boolean;
	hasProfileReadme: boolean;

	// github enriched (graphql)
	graphql: GitHubUserGraphQL | null;

	// achievements (scraped)
	achievements: GitHubAchievement[];

	// merged prs
	mergedPrCount: number;

	// tripwire events
	blockedCount: number;
	allowedCount: number;
	nearMissCount: number;
}

export interface ScoreResult {
	total: number;
	repoFamiliarity: number;
	communityStanding: number;
	ossPresence: number;
	trustSignal: number;
}

function clamp(value: number, max: number): number {
	return Math.min(Math.max(value, 0), max);
}

function scoreRepoFamiliarity(input: ScoreInput): number {
	let s = 0;

	const totalEvents = input.blockedCount + input.allowedCount + input.nearMissCount;

	// total events: 0=0, 1-5=5, 6-20=10, 20+=15
	s += totalEvents === 0 ? 0 : totalEvents <= 5 ? 5 : totalEvents <= 20 ? 10 : 15;

	// allowed events: 0=0, 1-5=5, 6-20=8, 20+=10
	s += input.allowedCount === 0 ? 0 : input.allowedCount <= 5 ? 5 : input.allowedCount <= 20 ? 8 : 10;

	// penalty for blocks: each block = -3
	s -= input.blockedCount * 3;

	// penalty for near misses: each = -1
	s -= input.nearMissCount;

	return clamp(s, 35);
}

function scoreCommunityStanding(input: ScoreInput): number {
	let s = 0;

	// account age: <30d=0, 30-180d=2, 180d-1y=4, 1-3y=6, 3-7y=8, 7+=10
	const days = input.accountAgeDays;
	s += days < 30 ? 0 : days < 180 ? 2 : days < 365 ? 4 : days < 1095 ? 6 : days < 2555 ? 8 : 10;

	// followers: 0-5=0, 5-20=2, 20-100=4, 100-500=6, 500+=8
	const f = input.followers;
	s += f < 5 ? 0 : f < 20 ? 2 : f < 100 ? 4 : f < 500 ? 6 : 8;

	// has bio: +2
	if (input.bio) s += 2;

	// has company: +2
	if (input.company) s += 2;

	// org memberships (graphql): 0=0, 1-3=2, 3+=3
	const orgCount = input.graphql?.organizations.length ?? 0;
	s += orgCount === 0 ? 0 : orgCount <= 3 ? 2 : 3;

	return clamp(s, 25);
}

function scoreOssPresence(input: ScoreInput): number {
	let s = 0;

	// public repos: 0=0, 1-5=1, 5-20=3, 20-50=5, 50+=7
	const repos = input.publicRepos;
	s += repos === 0 ? 0 : repos <= 5 ? 1 : repos <= 20 ? 3 : repos <= 50 ? 5 : 7;

	// merged PRs: 0=0, 1-10=2, 10-50=4, 50-200=6, 200+=8
	const prs = input.mergedPrCount;
	s += prs === 0 ? 0 : prs <= 10 ? 2 : prs <= 50 ? 4 : prs <= 200 ? 6 : 8;

	// sponsors/sponsoring (graphql): +1 each
	if (input.graphql?.sponsorsCount && input.graphql.sponsorsCount > 0) s += 1;
	if (input.graphql?.sponsoringCount && input.graphql.sponsoringCount > 0) s += 1;
	if (input.graphql?.hasSponsorsListing) s += 1;

	// github program badges: +1 each
	if (input.graphql?.isBountyHunter) s += 1;
	if (input.graphql?.isDeveloperProgramMember) s += 1;
	if (input.graphql?.isGitHubStar) s += 2;
	if (input.graphql?.isCampusExpert) s += 1;

	// achievements: pull-shark gold = +3, silver = +2, bronze = +1
	// starstruck gold = +3, etc.
	for (const a of input.achievements) {
		if (a.tier >= 4) s += 3;
		else if (a.tier >= 3) s += 2;
		else if (a.tier >= 2) s += 1;
	}

	return clamp(s, 20);
}

function scoreTrustSignal(input: ScoreInput): number {
	let s = 10; // start neutral

	// 2FA: +3
	if (input.hasTwoFactor) s += 3;

	// social accounts: +1 per (max 3)
	const socials = input.graphql?.socialAccounts.length ?? 0;
	s += Math.min(socials, 3);

	// profile readme: +2
	if (input.hasProfileReadme) s += 2;

	// blog/website: +1
	if (input.blog) s += 1;

	// twitter: +1
	if (input.twitterUsername) s += 1;

	// blocked ratio penalty
	const total = input.blockedCount + input.allowedCount;
	if (total > 0) {
		const blockedRatio = input.blockedCount / total;
		// >50% blocked = -5, >25% = -3, >10% = -1
		if (blockedRatio > 0.5) s -= 5;
		else if (blockedRatio > 0.25) s -= 3;
		else if (blockedRatio > 0.1) s -= 1;
	}

	return clamp(s, 20);
}

export function computeContributorScore(input: ScoreInput): ScoreResult {
	const repoFamiliarity = scoreRepoFamiliarity(input);
	const communityStanding = scoreCommunityStanding(input);
	const ossPresence = scoreOssPresence(input);
	const trustSignal = scoreTrustSignal(input);

	return {
		total: repoFamiliarity + communityStanding + ossPresence + trustSignal,
		repoFamiliarity,
		communityStanding,
		ossPresence,
		trustSignal,
	};
}
