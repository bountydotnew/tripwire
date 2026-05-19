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
 * Global vouch requests — GitHub users applying to be vouched.
 *
 * Submitted via the public /vouched page. Admins review and approve/deny
 * from the requests tab in the rules page. Approval creates a globalVouches
 * record.
 */
export type VouchRequestStatus = "pending" | "approved" | "denied"

export const vouchRequests = pgTable(
  "vouch_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    githubUsername: text("github_username").notNull(),
    githubUserId: integer("github_user_id"),
    avatarUrl: text("avatar_url"),
    /** Why they should be vouched */
    reason: text("reason").notNull(),
    status: text("status")
      .$type<VouchRequestStatus>()
      .notNull()
      .default("pending"),
    decidedById: text("decided_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("vouch_requests_status_idx").on(t.status),
    index("vouch_requests_username_idx").on(t.githubUsername),
    uniqueIndex("vouch_requests_pending_uniq")
      .on(sql`lower(${t.githubUsername})`)
      .where(sql`${t.status} = 'pending'`),
  ]
)
