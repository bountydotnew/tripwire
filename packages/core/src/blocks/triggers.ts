import type { BlockDefinition } from "./index"

export const triggerDefinitions: Record<string, BlockDefinition> = {
  pr_opened: {
    summary: "Fires when a pull request is opened against the repo.",
    example: "Use as the starting point for PR screening workflows.",
  },
  pr_edited: {
    summary: "Fires when an existing pull request is edited.",
    example:
      "Re-evaluate a PR after the author updates the title or description.",
  },
  issue_opened: {
    summary: "Fires when a new issue is created.",
    example: "Screen new issues for spam or low-quality content.",
  },
  issue_edited: {
    summary: "Fires when an existing issue is edited.",
    example: "Re-check issue content after edits for policy violations.",
  },
  comment_created: {
    summary: "Fires when a comment is posted on an issue or PR.",
    example: "Scan comments for crypto addresses or spam links.",
  },
  contributor_first_interaction: {
    summary: "Fires the first time a user interacts with the repo.",
    example: "Run extra checks on brand-new contributors.",
  },
  schedule: {
    summary: "Runs the workflow at a set time interval.",
    example: "Set to daily at 09:00 to scan for stale PRs every morning.",
  },
  manual: {
    summary: "Fires when a maintainer triggers the workflow by hand.",
    example: "Run a one-off scan against a specific contributor.",
  },
  repo_scan: {
    summary: "Scans repo history to find past offenders.",
    example: "Retroactively check existing PRs against new rules.",
  },
} as const
