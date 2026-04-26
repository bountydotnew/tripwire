import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	jsonb,
	uuid,
	index,
} from "drizzle-orm/pg-core";

// ─── Better Auth tables ────────────────────────────────────────
// These are managed by better-auth. We define them here so Drizzle
// is aware of them for relations/migrations.

export const user = pgTable("user", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	email: text("email").notNull().unique(),
	emailVerified: boolean("email_verified").notNull().default(false),
	image: text("image"),
	githubId: text("github_id").unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
	id: text("id").primaryKey(),
	expiresAt: timestamp("expires_at").notNull(),
	token: text("token").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
	ipAddress: text("ip_address"),
	userAgent: text("user_agent"),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
	id: text("id").primaryKey(),
	accountId: text("account_id").notNull(),
	providerId: text("provider_id").notNull(),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	accessToken: text("access_token"),
	refreshToken: text("refresh_token"),
	idToken: text("id_token"),
	accessTokenExpiresAt: timestamp("access_token_expires_at"),
	refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
	scope: text("scope"),
	password: text("password"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
	id: text("id").primaryKey(),
	identifier: text("identifier").notNull(),
	value: text("value").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at"),
	updatedAt: timestamp("updated_at"),
});

// Better Auth organization plugin tables
export const organization = pgTable("organization", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	slug: text("slug").unique(),
	logo: text("logo"),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	metadata: text("metadata"),
});

export const member = pgTable("member", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	userId: text("user_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	role: text("role").notNull(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const invitation = pgTable("invitation", {
	id: text("id").primaryKey(),
	organizationId: text("organization_id")
		.notNull()
		.references(() => organization.id, { onDelete: "cascade" }),
	email: text("email").notNull(),
	role: text("role"),
	status: text("status").notNull(),
	expiresAt: timestamp("expires_at").notNull(),
	inviterId: text("inviter_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
});

// ─── Tripwire tables ───────────────────────────────────────────

/**
 * GitHub App installations — one per org/user account.
 */
export const organizations = pgTable(
	"organizations",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		githubInstallationId: integer("github_installation_id").notNull().unique(),
		githubAccountId: integer("github_account_id").notNull().unique(),
		githubAccountLogin: text("github_account_login").notNull(),
		githubAccountType: text("github_account_type").notNull().default("Organization"), // "Organization" | "User"
		avatarUrl: text("avatar_url"),
		// The user who owns this org in Tripwire
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("org_owner_idx").on(t.ownerId)],
);

/**
 * Repos that Tripwire is active on within an org.
 */
export const repositories = pgTable(
	"repositories",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		orgId: uuid("org_id")
			.notNull()
			.references(() => organizations.id, { onDelete: "cascade" }),
		githubRepoId: integer("github_repo_id").notNull().unique(),
		name: text("name").notNull(),
		fullName: text("full_name").notNull(), // "owner/repo"
		isPrivate: boolean("is_private").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [index("repo_org_idx").on(t.orgId)],
);

/**
 * Rule configuration per repository. Stores all rule settings as JSONB
 * so configs can be exported/imported as JSON trivially.
 */
/**
 * What happens when a rule is violated.
 *
 * - "block"     — close the PR/issue or delete the comment (default)
 * - "warn"      — leave a Tripwire comment but don't close
 * - "log"       — record the event silently, take no GitHub action
 * - "threshold" — ignore until `thresholdCount` violations, then block
 */
export type RuleAction = "block" | "warn" | "log" | "threshold";

/** Base fields every rule shares */
type RuleBase = {
	enabled: boolean;
	action: RuleAction;
	/** Only used when action === "threshold" */
	thresholdCount?: number;
};

export type RuleConfig = {
	aiSlopDetection: RuleBase;
	requireProfilePicture: RuleBase;
	languageRequirement: RuleBase & { language: string };
	minMergedPrs: RuleBase & { count: number };
	accountAge: RuleBase & { days: number };
	maxPrsPerDay: RuleBase & { limit: number };
	maxFilesChanged: RuleBase & { limit: number };
	repoActivityMinimum: RuleBase & { minRepos: number };
	requireProfileReadme: RuleBase;
	cryptoAddressDetection: RuleBase;
};

export const DEFAULT_RULE_CONFIG: RuleConfig = {
	aiSlopDetection: { enabled: false, action: "block" },
	requireProfilePicture: { enabled: false, action: "block" },
	languageRequirement: { enabled: false, action: "block", language: "English" },
	minMergedPrs: { enabled: false, action: "block", count: 15 },
	accountAge: { enabled: false, action: "block", days: 30 },
	maxPrsPerDay: { enabled: false, action: "block", limit: 5 },
	maxFilesChanged: { enabled: false, action: "block", limit: 20 },
	repoActivityMinimum: { enabled: false, action: "block", minRepos: 3 },
	requireProfileReadme: { enabled: false, action: "block" },
	cryptoAddressDetection: { enabled: false, action: "block" },
};

export const ruleConfigs = pgTable("rule_configs", {
	id: uuid("id").primaryKey().defaultRandom(),
	repoId: uuid("repo_id")
		.notNull()
		.unique()
		.references(() => repositories.id, { onDelete: "cascade" }),
	config: jsonb("config").$type<RuleConfig>().notNull().default(DEFAULT_RULE_CONFIG),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * Whitelisted GitHub users — exempt from all rules for a given repo.
 */
export const whitelistEntries = pgTable(
	"whitelist_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repoId: uuid("repo_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		githubUsername: text("github_username").notNull(),
		githubUserId: integer("github_user_id"),
		avatarUrl: text("avatar_url"),
		addedById: text("added_by_id").references(() => user.id),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("whitelist_repo_idx").on(t.repoId),
		index("whitelist_unique_idx").on(t.repoId, t.githubUsername),
	],
);

/**
 * Blacklisted GitHub users — blocked from all interaction for a given repo.
 */
export const blacklistEntries = pgTable(
	"blacklist_entries",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repoId: uuid("repo_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		githubUsername: text("github_username").notNull(),
		githubUserId: integer("github_user_id"),
		avatarUrl: text("avatar_url"),
		addedById: text("added_by_id").references(() => user.id),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("blacklist_repo_idx").on(t.repoId),
		index("blacklist_unique_idx").on(t.repoId, t.githubUsername),
	],
);

/**
 * Event log — comprehensive activity feed for everything that happens
 * in a Tripwire installation. Every webhook, rule evaluation, near-miss,
 * config change, and admin action is captured here.
 */
export type EventAction =
	// Actions taken on content
	| "pr_closed"
	| "issue_closed"
	| "comment_deleted"
	// Pipeline lifecycle
	| "pipeline_allowed"    // all rules passed, content was allowed through
	| "pipeline_blocked"    // a rule blocked the content
	// Near-miss warnings
	| "rule_near_miss"      // user was close to triggering a rule
	// List-based outcomes
	| "whitelist_bypass"    // whitelisted user skipped all rules
	| "blacklist_blocked"   // blacklisted user was auto-blocked
	// Configuration changes
	| "rule_config_updated" // rule settings were changed
	| "whitelist_added"     // user added to whitelist
	| "whitelist_removed"   // user removed from whitelist
	| "blacklist_added"     // user added to blacklist
	| "blacklist_removed"   // user removed from blacklist
	// Legacy (kept for backward compat with insights)
	| "user_blocked"
	| "bot_blacklisted"
	| "rule_triggered"
	// Catch-all (renamed from issue_deleted for clarity)
	| "issue_deleted";

export type EventSeverity = "info" | "warning" | "success" | "error";
export type EventContentType = "pull_request" | "issue" | "comment";

export const events = pgTable(
	"events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repoId: uuid("repo_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		action: text("action").$type<EventAction>().notNull(),
		// Severity level for filtering and display
		severity: text("severity").$type<EventSeverity>().default("info"),
		// Human-readable description of what happened
		description: text("description"),
		// What type of GitHub content triggered this event
		contentType: text("content_type").$type<EventContentType>(),
		// Groups events from the same pipeline evaluation
		pipelineId: text("pipeline_id"),
		// Which rule triggered this event
		ruleName: text("rule_name"),
		// The GitHub user who triggered the event
		targetGithubUsername: text("target_github_username"),
		targetGithubUserId: integer("target_github_user_id"),
		// Reference to the GitHub object (PR number, issue number, comment ID)
		githubRef: text("github_ref"),
		// Extra context as JSON (PR title, comment body snippet, rule values, etc.)
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("events_repo_idx").on(t.repoId),
		index("events_created_idx").on(t.createdAt),
		index("events_action_idx").on(t.action),
		index("events_severity_idx").on(t.severity),
		index("events_pipeline_idx").on(t.pipelineId),
	],
);

/**
 * AI chat conversations — persisted chats with full message history.
 */
export const conversations = pgTable(
	"conversations",
	{
		id: uuid("id").primaryKey(),
		userId: text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		repoId: uuid("repo_id").references(() => repositories.id, {
			onDelete: "set null",
		}),
		title: text("title"),
		messages: jsonb("messages").$type<any[]>().notNull().default([]),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("conv_user_idx").on(t.userId),
		index("conv_updated_idx").on(t.updatedAt),
	],
);

/**
 * Waitlist entries for pre-launch signups.
 */
export const waitlist = pgTable("waitlist", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: text("email").notNull().unique(),
	createdAt: timestamp("created_at").notNull().defaultNow(),
});
