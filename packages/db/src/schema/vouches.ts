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

/**
 * Global vouch records — cross-repo trust signals.
 *
 * When a maintainer vouches for a GitHub user on any repo, a global
 * record is created. Repos with "auto-whitelist from global vouches"
 * enabled will automatically trust these users without per-repo
 * whitelisting.
 *
 * A user needs at least one vouch to be considered globally vouched.
 * Multiple vouches from different maintainers increase trust.
 */
export const globalVouches = pgTable(
  "global_vouches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubUsername: text("github_username").notNull(),
    githubUserId: integer("github_user_id"),
    avatarUrl: text("avatar_url"),
    /** The Tripwire user who vouched for this person */
    vouchedById: text("vouched_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Display name of the voucher (for public listing) */
    vouchedByName: text("vouched_by_name"),
    /** Optional reason/context for the vouch */
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("global_vouches_username_idx").on(t.githubUsername),
    index("global_vouches_user_id_idx").on(t.githubUserId),
    index("global_vouches_voucher_idx").on(t.vouchedById),
    uniqueIndex("global_vouches_user_voucher_uniq").on(
      sql`lower(${t.githubUsername})`,
      t.vouchedById
    ),
  ]
)
