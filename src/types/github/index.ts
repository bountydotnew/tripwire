export interface GitHubUser {
	login: string;
	id: number;
	avatar_url: string;
	html_url: string;
	name: string | null;
	company: string | null;
	blog: string | null;
	location: string | null;
	email: string | null;
	bio: string | null;
	twitter_username: string | null;
	public_repos: number;
	public_gists: number;
	followers: number;
	following: number;
	created_at: string;
	updated_at: string;
}

export interface ContributionActivity {
	totalContributions: number;
	weeks: Array<{
		contributionDays: Array<{
			contributionCount: number;
			date: string;
		}>;
	}>;
}

export interface GitHubRepository {
	id: number;
	name: string;
	full_name: string;
	owner: {
		login: string;
		avatar_url: string;
	};
	html_url: string;
	description: string | null;
	fork: boolean;
	stargazers_count: number;
	watchers_count: number;
	forks_count: number;
	open_issues_count: number;
	language: string | null;
	created_at: string;
	updated_at: string;
	pushed_at: string;
}

export interface GitHubEvent {
	id: string;
	type: string;
	actor: {
		login: string;
		avatar_url: string;
	};
	repo: {
		name: string;
	};
	created_at: string;
	payload: Record<string, unknown>;
}

export interface UserProfileData {
	user: GitHubUser;
	repos: GitHubRepository[];
	recentActivity: GitHubEvent[];
	contributionStats: {
		totalContributions: number;
		currentStreak: number;
		longestStreak: number;
	} | null;
}

export interface ProfileScore {
	total: number;
	breakdown: {
		community: number;
		ossImpact: number;
		activity: number;
		ecosystem: number;
	};
	signals: ProfileSignal[];
}

export interface ProfileSignal {
	category: "community" | "ossImpact" | "activity" | "ecosystem";
	label: string;
	value: string | number;
	weight: number;
	score: number;
}
