import type { BlockDefinition } from "./index"

export const transformDefinitions: Record<string, BlockDefinition> = {
  fetch_github_user: {
    summary: "Fetches the contributor's GitHub profile data.",
    example: "Place before rule checks that need account age or repo count.",
  },
  compute_score: {
    summary: "Calculates the contributor's Tripwire reputation score.",
    example: "Use before a condition node to branch on score thresholds.",
  },
  fetch_pr_files: {
    summary: "Gets the list of files changed in the pull request.",
    example: "Use before a file count check or sensitive path detection.",
  },
  scan_history: {
    summary: "Checks the repo's event history for the contributor.",
    example: "Look up whether this user has been flagged before.",
  },
  detect_language: {
    summary: "Analyzes the content language of the PR or issue.",
    example: "Use before a language rule to detect non-English contributions.",
  },
} as const
