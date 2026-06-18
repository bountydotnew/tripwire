import { pgTable, text, boolean, timestamp } from "drizzle-orm/pg-core"
import { organization } from "./orgs"

export type Tone = "formal" | "neutral" | "casual"
export type RouteMode = "comment" | "check" | "both" | "silent"
export type EmailDigest = "off" | "daily" | "weekly"

export const orgPrCommentPreferences = pgTable("org_pr_comment_preferences", {
  betterAuthOrgId: text("better_auth_org_id")
    .primaryKey()
    .references(() => organization.id, { onDelete: "cascade" }),

  showReason: boolean("show_reason").notNull().default(true),
  showRuleName: boolean("show_rule_name").notNull().default(false),
  showAppealLink: boolean("show_appeal_link").notNull().default(true),
  showWarningDisclaimer: boolean("show_warning_disclaimer")
    .notNull()
    .default(true),

  botDisplayName: text("bot_display_name").notNull().default("Tripwire"),
  tone: text("tone").$type<Tone>().notNull().default("neutral"),
  customFooterText: text("custom_footer_text"),

  routeMode: text("route_mode").$type<RouteMode>().notNull().default("comment"),
  slackWebhookUrl: text("slack_webhook_url"),
  discordWebhookUrl: text("discord_webhook_url"),
  emailDigest: text("email_digest").$type<EmailDigest>().notNull().default("off"),

  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
})

export type OrgPrCommentPreferences = typeof orgPrCommentPreferences.$inferSelect
export type NewOrgPrCommentPreferences =
  typeof orgPrCommentPreferences.$inferInsert

export const DEFAULT_PR_COMMENT_PREFERENCES: Omit<
  OrgPrCommentPreferences,
  "betterAuthOrgId" | "createdAt" | "updatedAt"
> = {
  showReason: true,
  showRuleName: false,
  showAppealLink: true,
  showWarningDisclaimer: true,
  botDisplayName: "Tripwire",
  tone: "neutral",
  customFooterText: null,
  routeMode: "comment",
  slackWebhookUrl: null,
  discordWebhookUrl: null,
  emailDigest: "off",
}
