import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"
import { organization } from "./orgs"
import { repositories } from "./installations"

/**
 * Per-user workspace preferences — persists which org/repo is active
 * so the selection survives across sessions and devices.
 */
export const userPreferences = pgTable("user_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  activeOrgId: text("active_org_id").references(() => organization.id, {
    onDelete: "set null",
  }),
  activeRepoId: uuid("active_repo_id").references(() => repositories.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})
