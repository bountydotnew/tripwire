import type { EventAction } from "@tripwire/db"

/**
 * The single source of truth for human-readable event-action labels.
 *
 * Typed as an exhaustive `Record<EventAction, string>` on purpose: add a new
 * action to the `EventAction` union and the compiler forces a label here — so
 * the label is defined in exactly one place instead of every route that
 * renders events.
 */
export const EVENT_ACTION_LABELS: Record<EventAction, string> = {
  // GitHub repository activity
  github_pr_opened: "Pull request opened",
  github_pr_reopened: "Pull request reopened",
  github_pr_closed: "Pull request closed",
  github_pr_merged: "Pull request merged",
  github_pr_synchronized: "Pull request updated",
  github_issue_opened: "Issue opened",
  github_issue_reopened: "Issue reopened",
  github_issue_closed: "Issue closed",
  github_comment_created: "Comment created",
  github_push: "Push",
  github_release_published: "Release published",
  // Actions taken on content
  pr_closed: "Pull request closed",
  issue_closed: "Issue closed",
  issue_deleted: "Issue deleted",
  comment_deleted: "Comment deleted",
  // Pipeline lifecycle
  pipeline_allowed: "Content allowed",
  pipeline_blocked: "Content blocked",
  pipeline_warned: "Content warned",
  pipeline_logged: "Content logged",
  // Near-miss warnings
  rule_near_miss: "Near miss warning",
  // List-based outcomes
  whitelist_bypass: "Whitelist bypass",
  bot_bypass: "Bot bypass",
  blacklist_blocked: "Blacklisted user blocked",
  // Configuration changes
  rule_config_updated: "Config updated",
  whitelist_added: "Added to whitelist",
  whitelist_removed: "Removed from whitelist",
  blacklist_added: "Added to blacklist",
  blacklist_removed: "Removed from blacklist",
  // Contributor / unblock requests
  request_submitted: "Request submitted",
  request_decided: "Request decided",
  // Legacy
  user_blocked: "User blocked",
  bot_blacklisted: "Bot blacklisted",
  rule_triggered: "Rule triggered",
  // Workflow execution
  workflow_run: "Workflow run",
  // Reputation administration
  score_reset: "Score reset",
  block_cleared: "Block cleared",
}

/** Look up an action label, falling back to the raw action string. */
export function getEventActionLabel(action: string): string {
  return EVENT_ACTION_LABELS[action as EventAction] ?? action
}

/**
 * Headline for an event card or detail view: the action label adjusted for
 * severity — errors read as a block, generic warnings as suspected spam.
 */
export function getEventTitle(
  action: string,
  severity: string | null | undefined,
  fallback: string
): string {
  let title = EVENT_ACTION_LABELS[action as EventAction] ?? fallback
  if (severity === "error") title = `Blocked — ${title.toLowerCase()}`
  if (severity === "warning" && action !== "rule_near_miss")
    title = "Suspected spam"
  return title
}
