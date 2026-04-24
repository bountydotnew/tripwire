export type MessageType =
	| "text"
	| "tool_call"
	| "event_card"
	| "confirm"
	| "ban_result"
	| "user_profile"
	| "signals_card"
	| "commits_card"
	| "stats_card"
	| "verdict_card"
	| "slop_action_result";

export interface DemoMessage {
	id: number;
	delay: number;
	role: "user" | "ai";
	type?: MessageType;
	text?: string;
	toolName?: string;
	toolArgs?: string;
	afterConfirm?: boolean;
	yesLabel?: string;
	noLabel?: string;
	approvedLabel?: string;
}

export interface DemoScenario {
	label: string;
	sequence: DemoMessage[];
	deniedText: string;
}

export const DEMO_SCENARIOS: Record<string, DemoScenario> = {
	"ban-flow": {
		label: "Ban spam account",
		sequence: [
			{ id: 1, delay: 400, role: "user", text: "Any new users flagged today?" },
			{
				id: 2,
				delay: 1100,
				role: "ai",
				type: "text",
				text: "Yes - 2 accounts triggered rules in the last 24 hours. Both opened issues on bounty-new/app within the last 6 hours.",
			},
			{
				id: 3,
				delay: 1800,
				role: "user",
				text: "Tell me more about @Dlove123",
			},
			{
				id: 4,
				delay: 800,
				role: "ai",
				type: "tool_call",
				toolName: "get_event",
				toolArgs: '{ id: "e_quiet_1" }',
			},
			{ id: 5, delay: 1350, role: "ai", type: "event_card" },
			{
				id: 6,
				delay: 2200,
				role: "user",
				text: "Can you go ahead and ban them?",
			},
			{
				id: 7,
				delay: 900,
				role: "ai",
				type: "confirm",
				text: "I'll call ban_user(@Dlove123) to permanently block them from contributing. Want me to proceed?",
			},
			{
				id: 8,
				delay: 100,
				role: "ai",
				type: "tool_call",
				toolName: "ban_user",
				toolArgs: '{ username: "Dlove123" }',
				afterConfirm: true,
			},
			{ id: 9, delay: 1350, role: "ai", type: "ban_result", afterConfirm: true },
			{ id: 10, delay: 2000, role: "user", text: "thanks", afterConfirm: true },
			{
				id: 11,
				delay: 800,
				role: "ai",
				type: "text",
				text: "Done. @Dlove123 is permanently banned and issue #412 was auto-closed. Their 2 other open issues were also closed. Let me know if anything else comes up.",
				afterConfirm: true,
			},
		],
		deniedText:
			"Got it - no action taken. You can always ban from the event detail page.",
	},
	"ai-slop": {
		label: "Investigate AI slop",
		sequence: [
			{
				id: 1,
				delay: 400,
				role: "user",
				text: "Can you check if @stellar-coder99 is a real dev or AI slop? They just opened a PR.",
			},
			{
				id: 2,
				delay: 1000,
				role: "ai",
				type: "text",
				text: "On it - I'll pull their profile, contribution signals, recent commits, and activity stats.",
			},
			{
				id: 3,
				delay: 700,
				role: "ai",
				type: "tool_call",
				toolName: "get_user",
				toolArgs: '{ username: "stellar-coder99" }',
			},
			{ id: 4, delay: 1300, role: "ai", type: "user_profile" },
			{
				id: 5,
				delay: 1300,
				role: "ai",
				type: "text",
				text: "Account's 4 days old with a stock avatar and an empty profile. Let me check contribution signals.",
			},
			{
				id: 6,
				delay: 700,
				role: "ai",
				type: "tool_call",
				toolName: "analyze_signals",
				toolArgs: '{ user: "stellar-coder99" }',
			},
			{ id: 7, delay: 1400, role: "ai", type: "signals_card" },
			{
				id: 8,
				delay: 1400,
				role: "ai",
				type: "text",
				text: "Five high-signal matches. Now the commits.",
			},
			{
				id: 9,
				delay: 700,
				role: "ai",
				type: "tool_call",
				toolName: "get_commits",
				toolArgs: '{ user: "stellar-coder99", limit: 4 }',
			},
			{ id: 10, delay: 1300, role: "ai", type: "commits_card" },
			{
				id: 11,
				delay: 1500,
				role: "ai",
				type: "text",
				text: "All 4 commits landed inside a 2-minute window with generic AI-flavored messages and huge boilerplate diffs. Pulling activity stats to confirm.",
			},
			{
				id: 12,
				delay: 700,
				role: "ai",
				type: "tool_call",
				toolName: "get_stats",
				toolArgs: '{ user: "stellar-coder99" }',
			},
			{ id: 13, delay: 1300, role: "ai", type: "stats_card" },
			{ id: 14, delay: 1800, role: "ai", type: "verdict_card" },
			{
				id: 15,
				delay: 1400,
				role: "ai",
				type: "text",
				text: "Verdict: almost certainly not a real human. I'd recommend blocking their PR and adding them to the watchlist - want me to do that?",
			},
			{
				id: 16,
				delay: 1100,
				role: "ai",
				type: "confirm",
				text: "I'll block PR #812 and add @stellar-coder99 to the AI-slop watchlist. Want me to proceed?",
				yesLabel: "Yes, block & watchlist",
				noLabel: "No, cancel",
				approvedLabel: "Approved - blocking PR and adding to watchlist...",
			},
			{
				id: 17,
				delay: 100,
				role: "ai",
				type: "tool_call",
				toolName: "block_pr",
				toolArgs: "{ pr: 812 }",
				afterConfirm: true,
			},
			{
				id: 18,
				delay: 900,
				role: "ai",
				type: "tool_call",
				toolName: "add_to_watchlist",
				toolArgs: '{ user: "stellar-coder99", list: "ai-slop" }',
				afterConfirm: true,
			},
			{
				id: 19,
				delay: 1300,
				role: "ai",
				type: "slop_action_result",
				afterConfirm: true,
			},
			{
				id: 20,
				delay: 2000,
				role: "user",
				text: "thanks",
				afterConfirm: true,
			},
			{
				id: 21,
				delay: 900,
				role: "ai",
				type: "text",
				text: "Done. PR #812 is blocked and @stellar-coder99 is on the AI-slop watchlist. Future submissions from similar-signal accounts will auto-pipeline through the same checks - I'll flag you if anything else triggers.",
				afterConfirm: true,
			},
		],
		deniedText:
			"Got it - no action taken. The account stays unblocked; you can still watchlist them manually from their profile.",
	},
};

// Mock data for the AI-slop scenario
export const AI_SLOP_USER = {
	username: "stellar-coder99",
	avatar: "https://i.pravatar.cc/80?img=60",
	accountAge: "4 days",
	publicRepos: 2,
	followers: 0,
	following: 0,
	bio: null,
	location: null,
};

export const AI_SLOP_SIGNALS = [
	{ label: "No profile picture", severity: "high" },
	{ label: "Account < 7 days old", severity: "high" },
	{ label: "0 followers", severity: "medium" },
	{ label: "No profile README", severity: "medium" },
	{ label: "Generic AI commit messages", severity: "high" },
];

export const AI_SLOP_COMMITS = [
	{ hash: "a7c3f21", message: "Add initial implementation", time: "2m ago", files: 47 },
	{ hash: "b8d4e32", message: "Update configuration files", time: "2m ago", files: 12 },
	{ hash: "c9e5f43", message: "Add documentation", time: "2m ago", files: 8 },
	{ hash: "d0f6g54", message: "Fix minor issues", time: "2m ago", files: 23 },
];
