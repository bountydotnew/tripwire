import type { GitHubUser, GitHubRepository, GitHubEvent, ProfileScore, ProfileSignal } from "#/types/github";

const WEIGHTS = {
	community: {
		followers: { weight: 0.4, max: 10000 },
		following: { weight: 0.1, max: 500 },
		bio: { weight: 0.2, flat: 5 },
		company: { weight: 0.15, flat: 4 },
		location: { weight: 0.15, flat: 3 },
	},
	ossImpact: {
		publicRepos: { weight: 0.3, max: 100 },
		totalStars: { weight: 0.4, max: 5000 },
		totalForks: { weight: 0.3, max: 1000 },
	},
	activity: {
		recentEvents: { weight: 0.5, max: 50 },
		accountAge: { weight: 0.3, max: 10 },
		repoActivity: { weight: 0.2, max: 30 },
	},
	ecosystem: {
		languageDiversity: { weight: 0.4, max: 10 },
		hasReadme: { weight: 0.3, flat: 8 },
		popularRepos: { weight: 0.3, max: 5 },
	},
};

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function normalize(value: number, max: number): number {
	return clamp(value / max, 0, 1) * 25;
}

function getAccountAgeYears(createdAt: string): number {
	const created = new Date(createdAt);
	const now = new Date();
	return (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24 * 365);
}

export function calculateProfileScore(
	user: GitHubUser,
	repos: GitHubRepository[],
	events: GitHubEvent[]
): ProfileScore {
	const signals: ProfileSignal[] = [];

	// Community score (25 points max)
	let communityScore = 0;

	const followerScore = normalize(user.followers, WEIGHTS.community.followers.max) * WEIGHTS.community.followers.weight;
	signals.push({
		category: "community",
		label: "Followers",
		value: user.followers,
		weight: WEIGHTS.community.followers.weight,
		score: followerScore,
	});
	communityScore += followerScore;

	if (user.bio) {
		const bioScore = WEIGHTS.community.bio.flat * WEIGHTS.community.bio.weight;
		signals.push({
			category: "community",
			label: "Has bio",
			value: "Yes",
			weight: WEIGHTS.community.bio.weight,
			score: bioScore,
		});
		communityScore += bioScore;
	}

	if (user.company) {
		const companyScore = WEIGHTS.community.company.flat * WEIGHTS.community.company.weight;
		signals.push({
			category: "community",
			label: "Company",
			value: user.company,
			weight: WEIGHTS.community.company.weight,
			score: companyScore,
		});
		communityScore += companyScore;
	}

	// OSS Impact score (25 points max)
	let ossScore = 0;

	const repoScore = normalize(user.public_repos, WEIGHTS.ossImpact.publicRepos.max) * WEIGHTS.ossImpact.publicRepos.weight;
	signals.push({
		category: "ossImpact",
		label: "Public repos",
		value: user.public_repos,
		weight: WEIGHTS.ossImpact.publicRepos.weight,
		score: repoScore,
	});
	ossScore += repoScore;

	const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
	const starScore = normalize(totalStars, WEIGHTS.ossImpact.totalStars.max) * WEIGHTS.ossImpact.totalStars.weight;
	signals.push({
		category: "ossImpact",
		label: "Total stars",
		value: totalStars,
		weight: WEIGHTS.ossImpact.totalStars.weight,
		score: starScore,
	});
	ossScore += starScore;

	const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);
	const forkScore = normalize(totalForks, WEIGHTS.ossImpact.totalForks.max) * WEIGHTS.ossImpact.totalForks.weight;
	signals.push({
		category: "ossImpact",
		label: "Total forks",
		value: totalForks,
		weight: WEIGHTS.ossImpact.totalForks.weight,
		score: forkScore,
	});
	ossScore += forkScore;

	// Activity score (25 points max)
	let activityScore = 0;

	const recentEventScore = normalize(events.length, WEIGHTS.activity.recentEvents.max) * WEIGHTS.activity.recentEvents.weight;
	signals.push({
		category: "activity",
		label: "Recent events",
		value: events.length,
		weight: WEIGHTS.activity.recentEvents.weight,
		score: recentEventScore,
	});
	activityScore += recentEventScore;

	const accountAge = getAccountAgeYears(user.created_at);
	const ageScore = normalize(accountAge, WEIGHTS.activity.accountAge.max) * WEIGHTS.activity.accountAge.weight;
	signals.push({
		category: "activity",
		label: "Account age",
		value: `${Math.floor(accountAge)} years`,
		weight: WEIGHTS.activity.accountAge.weight,
		score: ageScore,
	});
	activityScore += ageScore;

	// Ecosystem score (25 points max)
	let ecosystemScore = 0;

	const languages = new Set(repos.map((r) => r.language).filter(Boolean));
	const langScore = normalize(languages.size, WEIGHTS.ecosystem.languageDiversity.max) * WEIGHTS.ecosystem.languageDiversity.weight;
	signals.push({
		category: "ecosystem",
		label: "Languages",
		value: languages.size,
		weight: WEIGHTS.ecosystem.languageDiversity.weight,
		score: langScore,
	});
	ecosystemScore += langScore;

	const popularRepos = repos.filter((r) => r.stargazers_count >= 100).length;
	const popularScore = normalize(popularRepos, WEIGHTS.ecosystem.popularRepos.max) * WEIGHTS.ecosystem.popularRepos.weight;
	signals.push({
		category: "ecosystem",
		label: "Popular repos (100+ stars)",
		value: popularRepos,
		weight: WEIGHTS.ecosystem.popularRepos.weight,
		score: popularScore,
	});
	ecosystemScore += popularScore;

	const total = Math.round(communityScore + ossScore + activityScore + ecosystemScore);

	return {
		total: clamp(total, 0, 100),
		breakdown: {
			community: Math.round(communityScore),
			ossImpact: Math.round(ossScore),
			activity: Math.round(activityScore),
			ecosystem: Math.round(ecosystemScore),
		},
		signals,
	};
}
