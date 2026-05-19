import type { BlockDefinition } from "./index"

export const ruleDefinitions: Record<string, BlockDefinition> = {
  accountAge: {
    summary: "Checks if the contributor's GitHub account is old enough.",
    example: "Set minimum to 30 days to filter out throwaway accounts.",
  },
  minMergedPrs: {
    summary: "Checks if the contributor has enough merged PRs across GitHub.",
    example:
      "Require at least 15 merged PRs to prove real contribution history.",
  },
  requireProfileReadme: {
    summary: "Checks if the contributor has a profile README.",
    example: "Accounts without a profile README are more likely to be bots.",
  },
  repoActivityMinimum: {
    summary: "Checks if the contributor owns enough public repos.",
    example: "Require at least 3 non-fork repos to show genuine activity.",
  },
  maxPrsPerDay: {
    summary: "Flags contributors who open too many PRs in a single day.",
    example: "Set limit to 5 to catch spam PR floods.",
  },
  maxFilesChanged: {
    summary: "Flags PRs that touch too many files at once.",
    example: "Set limit to 20 files to catch bulk-edit spam PRs.",
  },
  language: {
    summary:
      "Checks if the PR or issue content is written in the required language.",
    example: "Set to English to filter non-English contributions.",
  },
  crypto: {
    summary: "Detects crypto wallet addresses in PR or issue content.",
    example: "Catches spam PRs that try to inject crypto addresses.",
  },
  vouchedUsersOnly: {
    summary: "Only allows contributions from vouched/whitelisted users.",
    example: "Set scope to repo whitelist for strict contributor gating.",
  },
  aiHoneypot: {
    summary: "Detects AI-generated PRs using honeypot signals in repo files.",
    example:
      "Add a CONTRIBUTING.md with hidden instructions that AI tools follow.",
  },
} as const
