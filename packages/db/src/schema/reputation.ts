import { sql } from "drizzle-orm"
import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { repositories } from "./installations"

/**
 * GitHub user reputation — event-driven running score per GitHub user.
 * Updated on every pipeline event (blocked/allowed/near-miss).
 *
 * Score formula: totalAllows - (totalBlocks * 3) - totalNearMisses
 *
 * TODO: cross-repo sharing (opt-in anonymous block signals to global pool)
 * TODO: velocity detection (flag users whose block rate is spiking)
 * TODO: time decay (recent events weigh more than old ones)
 * TODO: auto-rules ("auto-block users with reputation below X")
 * TODO: weekly digest email with trends
 */
export const githubReputation = pgTable(
  "github_reputation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // repoId nullable until #6 backfill completes; follow-up migration tightens to NOT NULL
    repoId: uuid("repo_id").references(() => repositories.id, {
      onDelete: "cascade",
    }),
    githubUsername: text("github_username").notNull(),
    githubUserId: integer("github_user_id"),
    score: integer("score").notNull().default(0),
    totalBlocks: integer("total_blocks").notNull().default(0),
    totalAllows: integer("total_allows").notNull().default(0),
    totalNearMisses: integer("total_near_misses").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // If set, events older than this timestamp are ignored when re-scoring
    // the contributor. Lets a maintainer "forgive" past blocks/near-misses
    // without deleting the audit trail.
    scoreResetAt: timestamp("score_reset_at"),
    scoreResetByUserId: text("score_reset_by_user_id").references(
      () => user.id,
      {
        onDelete: "set null",
      }
    ),
  },
  (t) => [
    index("reputation_score_idx").on(t.score),
    index("reputation_blocks_idx").on(t.totalBlocks),
    index("reputation_username_idx").on(t.githubUsername),
    uniqueIndex("github_reputation_repo_user_uniq").on(
      t.repoId,
      sql`lower(${t.githubUsername})`
    ),
  ]
)

/**
 * Per-(repo, user, rule) violation counters used by the "threshold" rule action.
 * Action "threshold" means: ignore until the user trips the rule N times,
 * then block. The counter increments on every violation that didn't already
 * block; once `count >= thresholdCount` the pipeline treats it as a block.
 */
export const ruleThresholdCounters = pgTable(
  "rule_threshold_counters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    githubUserId: integer("github_user_id").notNull(),
    ruleName: text("rule_name").notNull(),
    count: integer("count").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at").notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rule_threshold_counters_repo_user_rule_uniq").on(
      t.repoId,
      t.githubUserId,
      t.ruleName
    ),
  ]
)
