import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"

/**
 * Waitlist entries for pre-launch signups.
 */
export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})
