import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { repositories } from "./installations"

/**
 * Fake bounty configuration per repository.
 *
 * When enabled, Tripwire creates fake "bounty" issues that look solvable
 * but are designed to trap automated agents. Any PR/comment referencing a
 * fake bounty issue is flagged as a clanker (bot) submission.
 */
export const fakeBountyConfigs = pgTable("fake_bounty_configs", {
  id: uuid("id").primaryKey().defaultRandom(),
  repoId: uuid("repo_id")
    .notNull()
    .unique()
    .references(() => repositories.id, { onDelete: "cascade" }),
  enabled: boolean("enabled").notNull().default(false),
  /** Interval in hours between new fake bounty creation (0 = manual only) */
  intervalHours: integer("interval_hours").notNull().default(24),
  /** Maximum number of active fake bounties at a time */
  maxActive: integer("max_active").notNull().default(3),
  /** Message sent when declining a clanker submission */
  declineMessage: text("decline_message")
    .notNull()
    .default(
      "Thank you for your submission. After careful review, we've determined this solution doesn't meet our requirements. The approach needs a fundamentally different strategy. Please review the issue requirements more carefully before resubmitting."
    ),
  /** Labels to apply to fake bounty issues */
  issueLabels: jsonb("issue_labels")
    .$type<string[]>()
    .notNull()
    .default(["bounty", "good first issue", "help wanted"]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

/**
 * Individual fake bounty issues created in the repo.
 */
export type FakeBountyStatus = "active" | "closed" | "expired"

export const fakeBounties = pgTable(
  "fake_bounties",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    /** GitHub issue number */
    githubIssueNumber: integer("github_issue_number").notNull(),
    /** Issue title */
    title: text("title").notNull(),
    /** Issue body (the unsolvable problem) */
    body: text("body").notNull(),
    status: text("status")
      .$type<FakeBountyStatus>()
      .notNull()
      .default("active"),
    /** How many clanker submissions this bounty has caught */
    catchCount: integer("catch_count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    index("fake_bounties_repo_idx").on(t.repoId),
    index("fake_bounties_status_idx").on(t.status),
    uniqueIndex("fake_bounties_repo_issue_uniq").on(
      t.repoId,
      t.githubIssueNumber
    ),
  ]
)

/**
 * Caught clanker submissions to fake bounties.
 */
export const fakeBountyCatches = pgTable(
  "fake_bounty_catches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bountyId: uuid("bounty_id")
      .notNull()
      .references(() => fakeBounties.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubUsername: text("github_username").notNull(),
    githubUserId: integer("github_user_id"),
    /** PR number or comment ID that referenced the fake bounty */
    githubRef: text("github_ref").notNull(),
    /** "pr" | "comment" | "issue" */
    refType: text("ref_type").notNull(),
    /** Whether the decline message was sent */
    declineSent: boolean("decline_sent").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("fake_bounty_catches_bounty_idx").on(t.bountyId),
    index("fake_bounty_catches_repo_idx").on(t.repoId),
    index("fake_bounty_catches_user_idx").on(t.githubUsername),
  ]
)
