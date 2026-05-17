import { sql } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";

// ─── Types for cached JSONB columns ────────────────────────────

export interface CachedPR {
	title: string;
	number: number;
	htmlUrl: string;
	state: string;
	createdAt: string;
	closedAt: string | null;
	mergedAt: string | null;
	repoFullName: string;
	labels: Array<{ name: string; color: string }>;
	authorLogin: string;
	authorAvatar: string;
	// Enriched from PR detail endpoint
	additions: number;
	deletions: number;
	changedFiles: number;
	commits: number;
	/** Minutes between PR open and merge (null if not merged) */
	timeToMergeMinutes: number | null;
	draft: boolean;
	/** merge_commit_sha or head sha */
	headSha: string | null;
	body: string | null;
	/** Who closed/merged the PR (null if still open) */
	closedBy: string | null;
	/** true = author closed their own PR, false = someone else closed it */
	selfClosed: boolean | null;
}

export interface CachedRepo {
	name: string;
	fullName: string;
	htmlUrl: string;
	description: string | null;
	stars: number;
	forks: number;
	language: string | null;
	isFork: boolean;
	createdAt: string;
	updatedAt: string;
	pushedAt: string | null;
	defaultBranch: string | null;
	openIssuesCount: number;
	topics: string[];
	license: string | null;
	size: number;
	archived: boolean;
}

// ─── Table ─────────────────────────────────────────────────────

/**
 * Cached GitHub user data — stores enriched API responses (PRs with
 * details, repos, GraphQL profile) so repeat lookups are instant and
 * the AI chat can drill into the data without re-fetching.
 *
 * One row per GitHub username (global — not per Tripwire repo).
 * TTL-based expiry: consumers check expiresAt before using cached data.
 */
export const githubUserCache = pgTable(
	"github_user_cache",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		githubUsername: text("github_username").notNull(),
		githubUserId: integer("github_user_id"),
		/** Full /users/:username REST API response */
		profileJson: jsonb("profile_json").$type<Record<string, unknown>>().notNull(),
		/** Array of enriched PR objects from search API */
		mergedPrsJson: jsonb("merged_prs_json").$type<CachedPR[]>().notNull().default([]),
		/** total_count from search (may be higher than array length) */
		mergedPrCount: integer("merged_pr_count").notNull().default(0),
		/** Array of enriched repo objects */
		reposJson: jsonb("repos_json").$type<CachedRepo[]>().notNull().default([]),
		repoCount: integer("repo_count").notNull().default(0),
		/** Full GraphQL enrichment blob (orgs, sponsors, badges, etc.) */
		graphqlJson: jsonb("graphql_json").$type<Record<string, unknown> | null>(),
		/** When this snapshot was fetched from GitHub */
		fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
		/** When this cache row expires (fetchedAt + TTL) */
		expiresAt: timestamp("expires_at").notNull(),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		uniqueIndex("github_user_cache_username_uniq").on(
			sql`lower(${t.githubUsername})`,
		),
		index("github_user_cache_expires_idx").on(t.expiresAt),
		index("github_user_cache_fetched_idx").on(t.fetchedAt),
	],
);
