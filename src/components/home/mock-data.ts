export interface User {
	username: string;
	name: string;
	avatar: string;
	accountAge: string;
	publicRepos: number;
	followers: number;
	mergedPrs: number;
	readme: boolean;
	tint: string;
}

export interface EventAction {
	label: string;
	kind: "close" | "pause" | "review" | "view";
}

export interface TripwireEvent {
	id: string;
	kind: string;
	severity: "error" | "warning" | "success";
	title: string;
	preview: string;
	users: string[];
	repo: string;
	ref: string;
	contentType: string;
	createdAt: string;
	ruleFired: string | null;
	groupKey: string;
	action: EventAction | null;
}

export const USERS: Record<string, User> = {
	Dlove123: {
		username: "Dlove123",
		name: "dlove123",
		avatar: "https://i.pravatar.cc/80?img=12",
		accountAge: "6 days",
		publicRepos: 0,
		followers: 0,
		mergedPrs: 0,
		readme: false,
		tint: "#d6a24d",
	},
	fr0st_btc: {
		username: "fr0st-btc",
		name: "fr0st-btc",
		avatar: "https://i.pravatar.cc/80?img=3",
		accountAge: "11 days",
		publicRepos: 1,
		followers: 2,
		mergedPrs: 0,
		readme: false,
		tint: "#e07a5f",
	},
	kenji_okabe: {
		username: "kenji-okabe",
		name: "Kenji Okabe",
		avatar: "https://i.pravatar.cc/80?img=68",
		accountAge: "2 years",
		publicRepos: 34,
		followers: 128,
		mergedPrs: 61,
		readme: true,
		tint: "#86b5e0",
	},
	svelte_maria: {
		username: "svelte-maria",
		name: "Maria Lopez",
		avatar: "https://i.pravatar.cc/80?img=47",
		accountAge: "4 months",
		publicRepos: 8,
		followers: 12,
		mergedPrs: 3,
		readme: true,
		tint: "#b08be0",
	},
};

export const EVENTS_QUIET: TripwireEvent[] = [
	{
		id: "e_quiet_1",
		kind: "suspected_spam",
		severity: "warning",
		title: "Suspected spam",
		preview:
			"Dear bounty creator ... Payout wallets:  Solana: 8BsByR6rPqxDPku6dYtdoiSk6...",
		users: ["Dlove123"],
		repo: "bounty-new/app",
		ref: "#412",
		contentType: "issue",
		createdAt: "2h ago",
		ruleFired: "cryptoAddressDetection",
		groupKey: "Dlove123-spam",
		action: { label: "Close issue", kind: "close" },
	},
	{
		id: "e_quiet_2",
		kind: "suspicious_activity",
		severity: "error",
		title: "Suspicious activity detected",
		preview: "4 comments in 90 seconds, all near-identical",
		users: ["Dlove123", "Dlove123", "Dlove123", "Dlove123"],
		repo: "bounty-new/app",
		ref: "-",
		contentType: "comment_burst",
		createdAt: "3h ago",
		ruleFired: "spamDetection",
		groupKey: "Dlove123-burst",
		action: { label: "Pause contributions", kind: "pause" },
	},
];

export const EVENTS_BUSY: TripwireEvent[] = [
	...EVENTS_QUIET,
	{
		id: "e_busy_1",
		kind: "rule_near_miss",
		severity: "warning",
		title: "Near miss - account age",
		preview:
			"@fr0st-btc has a 11-day-old account (threshold: 14 days). Allowed with warning.",
		users: ["fr0st_btc"],
		repo: "bounty-new/app",
		ref: "#415",
		contentType: "pull_request",
		createdAt: "4h ago",
		ruleFired: "accountAge",
		groupKey: "fr0st",
		action: { label: "Review PR", kind: "review" },
	},
	{
		id: "e_busy_2",
		kind: "pipeline_blocked",
		severity: "error",
		title: "Blocked - crypto address",
		preview: "@fr0st-btc opened an issue containing 2 BTC addresses. Auto-closed.",
		users: ["fr0st_btc"],
		repo: "bounty-new/app",
		ref: "#416",
		contentType: "issue",
		createdAt: "5h ago",
		ruleFired: "cryptoAddressDetection",
		groupKey: "fr0st",
		action: { label: "View thread", kind: "view" },
	},
	{
		id: "e_busy_3",
		kind: "pipeline_allowed",
		severity: "success",
		title: "Allowed",
		preview: "@kenji-okabe passed all 8 enabled rules on PR #419.",
		users: ["kenji_okabe"],
		repo: "bounty-new/app",
		ref: "#419",
		contentType: "pull_request",
		createdAt: "6h ago",
		ruleFired: null,
		groupKey: "clean",
		action: null,
	},
	{
		id: "e_busy_5",
		kind: "language_violation",
		severity: "warning",
		title: "Non-English submission",
		preview: "Issue written in Japanese (detected: ja-JP)",
		users: ["svelte_maria"],
		repo: "bounty-new/app",
		ref: "#420",
		contentType: "issue",
		createdAt: "7h ago",
		ruleFired: "languageRequirement",
		groupKey: "wrong-lang",
		action: { label: "Review", kind: "review" },
	},
];
