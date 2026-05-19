import type { BlockDefinition } from "./index"

export const actionDefinitions: Record<string, BlockDefinition> = {
  block: {
    summary: "Closes the PR or issue immediately.",
    example: "Use after a rule fails to auto-close spam PRs with a message.",
  },
  warn: {
    summary: "Posts a warning comment but keeps the content open.",
    example: "Warn new contributors about missing profile info.",
  },
  log: {
    summary: "Records the event silently without any GitHub action.",
    example: "Log suspicious activity for later review without blocking.",
  },
  close: {
    summary: "Closes the PR or issue without posting a comment.",
    example: "Silently close PRs from blacklisted accounts.",
  },
  label: {
    summary: "Adds a label to the PR or issue.",
    example: 'Add a "needs-review" label to flag PRs from new contributors.',
  },
  comment: {
    summary: "Posts a comment on the PR or issue.",
    example: "Welcome first-time contributors with repo guidelines.",
  },
  add_to_whitelist: {
    summary: "Adds the contributor to the repo whitelist.",
    example: "Auto-whitelist users who pass all rule checks.",
  },
  add_to_blacklist: {
    summary: "Adds the contributor to the repo blacklist.",
    example: "Blacklist repeat offenders caught by multiple rules.",
  },
  remove_from_whitelist: {
    summary: "Removes the contributor from the repo whitelist.",
    example: "Revoke whitelist status when a user starts failing checks.",
  },
  remove_from_blacklist: {
    summary: "Removes the contributor from the repo blacklist.",
    example: "Unblock a user after an appeal is approved.",
  },
  notify_slack: {
    summary: "Sends a notification to a Slack webhook.",
    example: "Alert your team channel when a suspicious PR is detected.",
  },
  notify_discord: {
    summary: "Sends a notification to a Discord webhook.",
    example: "Post to your moderation channel when rules trigger.",
  },
  send_webhook: {
    summary: "Sends an HTTP POST to a custom webhook URL.",
    example: "Forward event data to your own API for custom processing.",
  },
  request_review: {
    summary: "Requests a review from a specified user or team.",
    example: "Auto-assign a reviewer when a PR touches sensitive files.",
  },
} as const
