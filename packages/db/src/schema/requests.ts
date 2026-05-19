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
 * Contributor / unblock requests submitted by GitHub users who were
 * blocked by Tripwire or who want vouched-only access.
 *
 * Lifecycle: pending → approved | denied. Approval auto-mutates the
 * whitelist (kind=access) or blacklist (kind=unblock) for that repo.
 */
export type RequestKind = "unblock" | "access"
export type RequestStatus = "pending" | "approved" | "denied"

export const contributorRequests = pgTable(
  "contributor_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RequestKind>().notNull(),
    githubUsername: text("github_username").notNull(),
    githubUserId: integer("github_user_id"),
    avatarUrl: text("avatar_url"),
    reason: text("reason").notNull(),
    status: text("status").$type<RequestStatus>().notNull().default("pending"),
    decidedById: text("decided_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("requests_repo_idx").on(t.repoId),
    index("requests_status_idx").on(t.status),
    index("requests_repo_user_idx").on(t.repoId, t.githubUsername),
    uniqueIndex("contributor_requests_pending_uniq")
      .on(t.repoId, t.githubUsername, t.kind)
      .where(sql`${t.status} = 'pending'`),
  ]
)
