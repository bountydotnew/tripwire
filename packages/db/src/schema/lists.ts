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
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("whitelist_repo_idx").on(t.repoId),
    uniqueIndex("whitelist_repo_username_uniq").on(
      t.repoId,
      sql`lower(${t.githubUsername})`
    ),
  ]
)

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
    addedById: text("added_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("blacklist_repo_idx").on(t.repoId),
    uniqueIndex("blacklist_repo_username_uniq").on(
      t.repoId,
      sql`lower(${t.githubUsername})`
    ),
  ]
)
