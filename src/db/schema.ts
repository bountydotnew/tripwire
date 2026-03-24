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
export type RuleConfig = {
	aiSlopDetection: { enabled: boolean };
	requireProfilePicture: { enabled: boolean };
	languageRequirement: { enabled: boolean; language: string };
	minMergedPrs: { enabled: boolean; count: number };
	accountAge: { enabled: boolean; days: number };
};

export const DEFAULT_RULE_CONFIG: RuleConfig = {
	aiSlopDetection: { enabled: false },
	requireProfilePicture: { enabled: false },
	languageRequirement: { enabled: false, language: "English" },
	minMergedPrs: { enabled: false, count: 15 },
	accountAge: { enabled: false, days: 30 },
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
 * Event log — every action Tripwire takes. Feeds the Insights page.
 */
export type EventAction =
	| "pr_closed"
	| "issue_deleted"
	| "comment_deleted"
	| "user_blocked"
	| "bot_blacklisted"
	| "rule_triggered";

export const events = pgTable(
	"events",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repoId: uuid("repo_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		action: text("action").$type<EventAction>().notNull(),
		// Which rule triggered this event
		ruleName: text("rule_name"),
		// The GitHub user who triggered the event
		targetGithubUsername: text("target_github_username"),
		targetGithubUserId: integer("target_github_user_id"),
		// Reference to the GitHub object (PR number, issue number, comment ID)
		githubRef: text("github_ref"),
		// Extra context as JSON (PR title, comment body snippet, etc.)
		metadata: jsonb("metadata").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
	},
	(t) => [
		index("events_repo_idx").on(t.repoId),
		index("events_created_idx").on(t.createdAt),
		index("events_action_idx").on(t.action),
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
