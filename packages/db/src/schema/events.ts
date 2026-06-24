import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { repositories } from "./installations"

/**
 * Event log — comprehensive activity feed for everything that happens
 * in a Tripwire installation. Every webhook, rule evaluation, near-miss,
 * config change, and admin action is captured here.
 */
export type EventAction =
  // GitHub repository activity captured from webhooks
  | "github_pr_opened"
  | "github_pr_reopened"
  | "github_pr_closed"
  | "github_pr_merged"
  | "github_pr_synchronized"
  | "github_issue_opened"
  | "github_issue_reopened"
  | "github_issue_closed"
  | "github_comment_created"
  | "github_push"
  | "github_release_published"
  // Actions taken on content
  | "pr_closed"
  | "issue_closed"
  | "comment_deleted"
  // Pipeline lifecycle
  | "pipeline_allowed" // all rules passed, content was allowed through
  | "pipeline_blocked" // a rule blocked the content
  | "pipeline_warned" // a rule warned but did not block
  | "pipeline_logged" // a rule fired in log-only mode
  // Near-miss warnings
  | "rule_near_miss" // user was close to triggering a rule
  // List-based outcomes
  | "whitelist_bypass" // whitelisted user skipped all rules
  | "bot_bypass" // bot sender (Tembo, CodeRabbit, etc.) skipped all rules
  | "blacklist_blocked" // blacklisted user was auto-blocked
  // Configuration changes
  | "rule_config_updated" // rule settings were changed
  | "whitelist_added" // user added to whitelist
  | "whitelist_removed" // user removed from whitelist
  | "blacklist_added" // user added to blacklist
  | "blacklist_removed" // user removed from blacklist
  // Contributor / unblock requests
  | "request_submitted" // a user submitted an unblock/access request
  | "request_decided" // a reviewer approved or denied a request
  // Legacy (kept for backward compat with insights)
  | "user_blocked"
  | "bot_blacklisted"
  | "rule_triggered"
  // Catch-all (renamed from issue_deleted for clarity)
  | "issue_deleted"
  // Workflow execution
  | "workflow_run" // a workflow was executed (manual run, simulation, or test)
  // Reputation administration
  | "score_reset" // maintainer cleared a user's contributor-score history
  | "block_cleared" // maintainer expunged a specific block (neutralizes its score impact)

export type EventSeverity = "info" | "warning" | "success" | "error"
export type EventContentType = "pull_request" | "issue" | "comment"

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    action: text("action").$type<EventAction>().notNull(),
    // Severity level for filtering and display
    severity: text("severity").$type<EventSeverity>().default("info"),
    // Human-readable description of what happened
    description: text("description"),
    // What type of GitHub content triggered this event
    contentType: text("content_type").$type<EventContentType>(),
    // Groups events from the same pipeline evaluation
    pipelineId: text("pipeline_id"),
    // Which rule triggered this event
    ruleName: text("rule_name"),
    // The GitHub user who triggered the event
    targetGithubUsername: text("target_github_username"),
    targetGithubUserId: integer("target_github_user_id"),
    // Reference to the GitHub object (PR number, issue number, comment ID)
    githubRef: text("github_ref"),
    // Extra context as JSON (PR title, comment body snippet, rule values, etc.)
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("events_repo_idx").on(t.repoId),
    index("events_created_idx").on(t.createdAt),
    index("events_action_idx").on(t.action),
    index("events_severity_idx").on(t.severity),
    index("events_pipeline_idx").on(t.pipelineId),
  ]
)
