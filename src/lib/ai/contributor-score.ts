/**
 * Contributor trust score (0-100) based on GitHub profile signals,
 * Tripwire event history, and community standing.
 *
 * Four categories:
 * - globalReputation (0-40): account age, followers, merged PRs, achievements, repos
 * - communitySignals (0-30): orgs, sponsors, badges, social accounts, 2FA, bio
 * - repoHistory (0-20): tripwire events (allowed/blocked/near-miss ratio)
 * - redFlags (0 to -10): high blocked ratio, suspicious patterns
 */

import type { GitHubAchievement, GitHubUserGraphQL } from "#/lib/github/github-api";

export interface ScoreInput {
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
	graphql: GitHubUserGraphQL | null;
	achievements: GitHubAchievement[];
	mergedPrCount: number;
	blockedCount: number;
	allowedCount: number;
	nearMissCount: number;
}

export interface ScoreResult {
	total: number;
	globalReputation: number;
	communitySignals: number;
	repoHistory: number;
	redFlags: number;
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(Math.max(value, min), max);
}

// ─── Achievement scoring ─────────────────────────────────────

const TIER_POINTS: Record<number, number> = {
	1: 1,   // default
	2: 2,   // bronze
	3: 4,   // silver
	4: 6,   // gold
};

const RARITY_MULTIPLIER: Record<string, number> = {
	"starstruck": 2,
	"arctic-code-vault-contributor": 2,
	"pull-shark": 1.5,
	"galaxy-brain": 1.5,
	"public-sponsor": 1.5,
	"pair-extraordinaire": 1,
	"open-sourcerer": 1,
	"heart-on-your-sleeve": 1,
	"mars-2020-contributor": 2,
	"yolo": 0.5,
	"quickdraw": 0.5,
};

function scoreAchievements(achievements: GitHubAchievement[]): number {
	let total = 0;
	for (const a of achievements) {
		const tierPts = TIER_POINTS[a.tier] ?? 1;
		const rarity = RARITY_MULTIPLIER[a.type] ?? 1;
		total += tierPts * rarity;
	}
	return Math.min(total, 20);
}

// ─── Global Reputation (0-40) ────────────────────────────────

function scoreGlobalReputation(input: ScoreInput): number {
	let s = 0;

	// account age: 15+y=15, 10-15y=12, 5-10y=10, 3-5y=8, 1-3y=5, 90d-1y=2, <90d=0
	const days = input.accountAgeDays;
	s += days >= 5475 ? 15 : days >= 3650 ? 12 : days >= 1825 ? 10 : days >= 1095 ? 8 : days >= 365 ? 5 : days >= 90 ? 2 : 0;

	// followers: 500+=8, 100-500=6, 20-100=4, 5-20=2, <5=0
	const f = input.followers;
	s += f >= 500 ? 8 : f >= 100 ? 6 : f >= 20 ? 4 : f >= 5 ? 2 : 0;

	// merged PRs: 500+=12, 200-500=10, 50-200=8, 10-50=5, 1-10=2, 0=0
	const prs = input.mergedPrCount;
	s += prs >= 500 ? 12 : prs >= 200 ? 10 : prs >= 50 ? 8 : prs >= 10 ? 5 : prs >= 1 ? 2 : 0;

	// public repos: 50+=5, 20-50=4, 5-20=2, 1-5=1, 0=0
	const repos = input.publicRepos;
	s += repos >= 50 ? 5 : repos >= 20 ? 4 : repos >= 5 ? 2 : repos >= 1 ? 1 : 0;

	// following (shows engagement): 50+=2, 10-50=1
	s += input.following >= 50 ? 2 : input.following >= 10 ? 1 : 0;

	// public gists: 5+=2, 1-5=1
	s += input.publicGists >= 5 ? 2 : input.publicGists >= 1 ? 1 : 0;

	return clamp(s, 0, 40);
}

// ─── Community Signals (0-30) ────────────────────────────────

function scoreCommunitySignals(input: ScoreInput): number {
	let s = 0;

	// achievements (variable, capped at 20)
	s += scoreAchievements(input.achievements);

	// sponsoring anyone: +4
	if (input.graphql?.sponsoringCount && input.graphql.sponsoringCount > 0) s += 4;

	// being sponsored: +5
	if (input.graphql?.sponsorsCount && input.graphql.sponsorsCount > 0) s += 5;

	// has sponsors listing: +2
	if (input.graphql?.hasSponsorsListing) s += 2;

	// org memberships: 3+=3, 1-2=2, 0=0
	const orgCount = input.graphql?.organizations.length ?? 0;
	s += orgCount >= 3 ? 3 : orgCount >= 1 ? 2 : 0;

	// github program badges: variable
	if (input.graphql?.isGitHubStar) s += 4;
	if (input.graphql?.isBountyHunter) s += 3;
	if (input.graphql?.isDeveloperProgramMember) s += 2;
	if (input.graphql?.isCampusExpert) s += 2;
	if (input.graphql?.isSiteAdmin) s += 5;

	// social signals
	const socials = input.graphql?.socialAccounts.length ?? 0;
	s += Math.min(socials, 2);
	if (input.bio) s += 1;
	if (input.company) s += 1;
	if (input.blog) s += 1;
	if (input.twitterUsername) s += 1;
	if (input.hasTwoFactor) s += 2;
	if (input.hasProfileReadme) s += 1;

	return clamp(s, 0, 30);
}

// ─── Repo History (0-20) ─────────────────────────────────────

function scoreRepoHistory(input: ScoreInput): number {
	const totalEvents = input.blockedCount + input.allowedCount + input.nearMissCount;

	// no repo history = neutral baseline (10/20)
	if (totalEvents === 0) return 10;

	let s = 10;

	// allowed events: +2 per (up to +10)
	s += Math.min(input.allowedCount * 2, 10);

	// blocked events: -3 per
	s -= input.blockedCount * 3;

	// near misses: -1 per
	s -= input.nearMissCount;

	return clamp(s, 0, 20);
}

// ─── Red Flags (0 to -10) ────────────────────────────────────

function scoreRedFlags(input: ScoreInput): number {
	let penalty = 0;

	// high blocked ratio
	const total = input.blockedCount + input.allowedCount;
	if (total > 0) {
		const blockedRatio = input.blockedCount / total;
		if (blockedRatio > 0.75) penalty -= 8;
		else if (blockedRatio > 0.5) penalty -= 5;
		else if (blockedRatio > 0.25) penalty -= 3;
	}

	// brand new account + no activity = slight concern
	if (input.accountAgeDays < 30 && input.mergedPrCount === 0 && input.publicRepos <= 1) {
		penalty -= 3;
	}

	// zero followers + zero following (potential throwaway)
	if (input.followers === 0 && input.following === 0 && input.accountAgeDays < 365) {
		penalty -= 2;
	}

	return clamp(penalty, -10, 0);
}

// ─── Main ────────────────────────────────────────────────────

export function computeContributorScore(input: ScoreInput): ScoreResult {
	const globalReputation = scoreGlobalReputation(input);
	const communitySignals = scoreCommunitySignals(input);
	const repoHistory = scoreRepoHistory(input);
	const redFlags = scoreRedFlags(input);

	// longevity floor: very old accounts with any activity are unlikely to be malicious
	// ensures 10+ year accounts never score below 45 regardless of other signals
	let raw = globalReputation + communitySignals + repoHistory + redFlags;
	if (input.accountAgeDays >= 3650 && input.publicRepos >= 1) {
		raw = Math.max(raw, 45);
	} else if (input.accountAgeDays >= 1825 && input.publicRepos >= 3) {
		raw = Math.max(raw, 35);
	}

	const total = clamp(raw, 0, 100);

	return {
		total,
		globalReputation,
		communitySignals,
		repoHistory,
		redFlags,
	};
}
