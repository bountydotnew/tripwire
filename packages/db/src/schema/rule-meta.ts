import type { RuleKey } from "./rules"

export interface RuleMeta {
  /** Display name (Title Case) */
  name: string
  /** Short description for cards & tooltips */
  description: string
  /** Whether the rule is coming soon / not yet configurable */
  comingSoon?: boolean
  /** The config field key for the numeric param, if any (e.g., "days", "count", "limit") */
  numericParam?: string
  /** Human label for the numeric param (e.g., "Minimum account age (days)") */
  numericLabel?: string
}

export const RULE_META: Record<RuleKey, RuleMeta> = {
  languageRequirement: {
    name: "Language Requirement",
    description: "Contributions in a disallowed language will be declined",
  },
  minMergedPrs: {
    name: "Minimum Merged PRs",
    description: "Minimum merged pull requests before they can contribute",
    numericParam: "count",
    numericLabel: "Minimum merged PRs",
  },
  accountAge: {
    name: "Account Age",
    description: "Block accounts created too recently from contributing",
    numericParam: "days",
    numericLabel: "Minimum account age (days)",
  },
  maxPrsPerDay: {
    name: "Max PRs Per Day",
    description: "Rate limit how many PRs a single user can open per day",
    numericParam: "limit",
    numericLabel: "Maximum PRs per day",
  },
  maxFilesChanged: {
    name: "Max Files Changed",
    description: "Block pull requests that touch too many files",
    numericParam: "limit",
    numericLabel: "Maximum files changed",
  },
  repoActivityMinimum: {
    name: "Repo Activity Minimum",
    description:
      "Contributor must have meaningful activity across public repos",
    numericParam: "minRepos",
    numericLabel: "Minimum public repos",
  },
  requireProfileReadme: {
    name: "Profile README",
    description:
      "Contributors must have a profile README on their GitHub account",
  },
  cryptoAddressDetection: {
    name: "Crypto Address Detection",
    description: "Block content containing cryptocurrency wallet addresses",
  },
  vouchedUsersOnly: {
    name: "Vouched Users Only",
    description: "Only allow contributions from vouched or whitelisted users",
  },
  aiHoneypot: {
    name: "AI Honeypot",
    description: "Flag PRs that mention a hidden phrase from your PR template",
  },
}
