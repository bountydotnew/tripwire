import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { organization } from "./orgs"
import { repositories } from "./installations"

/** JSON-serialized UI messages stored on `conversations.messages`. */
export type ConversationStoredMessage = Record<string, unknown>

/**
 * AI chat conversations — persisted chats with full message history.
 *
 * Scoped to an organization and shared across its members: every member of
 * the active org can read/continue any chat in it, with `userId` recording
 * the original author. A chat in org A is never visible from org B. `repoId`
 * may be null, but `organizationId` is always set so cross-org isolation holds.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").references(() => repositories.id, {
      onDelete: "set null",
    }),
    title: text("title"),
    messages: jsonb("messages")
      .$type<ConversationStoredMessage[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("conv_org_user_idx").on(t.organizationId, t.userId, t.updatedAt),
    index("conv_updated_idx").on(t.updatedAt),
  ]
)
