export type SignalType = "number" | "boolean" | "string"

export type SignalCategory =
  | "account"
  | "contributions"
  | "social"
  | "content"
  | "reputation"
  | "redFlags"
  | "badges"
  | "profile"

export interface SignalDefinition {
  id: string
  name: string
  category: SignalCategory
  type: SignalType
  description: string
  requiresEnrichment?: boolean
}

export const SIGNAL_REGISTRY: readonly SignalDefinition[] = [
  // Account
  {
    id: "accountAgeDays",
    name: "Account Age (days)",
    category: "account",
    type: "number",
    description: "Number of days since the GitHub account was created",
  },
  {
    id: "accountType",
    name: "Account Type",
    category: "account",
    type: "string",
    description: "GitHub account type (User or Organization)",
  },
  {
    id: "hasTwoFactor",
    name: "Has 2FA",
    category: "account",
    type: "boolean",
    description: "Whether two-factor authentication is enabled",
  },
  {
    id: "hasBio",
    name: "Has Bio",
    category: "account",
    type: "boolean",
    description: "Whether the user has a bio on their profile",
  },
  {
    id: "hasCompany",
    name: "Has Company",
    category: "account",
    type: "boolean",
    description: "Whether the user has a company listed",
  },
  {
    id: "hasBlog",
    name: "Has Blog",
    category: "account",
    type: "boolean",
    description: "Whether the user has a blog/website listed",
  },
  {
    id: "hasTwitter",
    name: "Has Twitter",
    category: "account",
    type: "boolean",
    description: "Whether the user has a Twitter username linked",
  },

  // Contributions
  {
    id: "mergedPrs",
    name: "Merged PRs",
    category: "contributions",
    type: "number",
    description: "Total number of merged pull requests",
  },
  {
    id: "closedPrs",
    name: "Closed PRs",
    category: "contributions",
    type: "number",
    description: "Total number of closed pull requests",
  },
  {
    id: "mergeRatio",
    name: "Merge Ratio",
    category: "contributions",
    type: "number",
    description: "Ratio of merged PRs to total closed PRs (0-1)",
  },
  {
    id: "publicRepos",
    name: "Public Repos",
    category: "contributions",
    type: "number",
    description: "Total number of public repositories",
  },
  {
    id: "nonForkRepos",
    name: "Non-Fork Repos",
    category: "contributions",
    type: "number",
    description: "Number of public non-fork repositories",
    requiresEnrichment: true,
  },
  {
    id: "forkRepos",
    name: "Fork Repos",
    category: "contributions",
    type: "number",
    description: "Number of public fork repositories",
    requiresEnrichment: true,
  },
  {
    id: "publicGists",
    name: "Public Gists",
    category: "contributions",
    type: "number",
    description: "Number of public gists",
  },
  {
    id: "contributionsLastYear",
    name: "Contributions Last Year",
    category: "contributions",
    type: "number",
    description: "Total contributions in the last year",
    requiresEnrichment: true,
  },

  // Social
  {
    id: "followers",
    name: "Followers",
    category: "social",
    type: "number",
    description: "Number of followers",
  },
  {
    id: "following",
    name: "Following",
    category: "social",
    type: "number",
    description: "Number of users being followed",
  },
  {
    id: "sponsorsCount",
    name: "Sponsors Count",
    category: "social",
    type: "number",
    description: "Number of sponsors",
    requiresEnrichment: true,
  },
  {
    id: "sponsoringCount",
    name: "Sponsoring Count",
    category: "social",
    type: "number",
    description: "Number of users being sponsored",
    requiresEnrichment: true,
  },
  {
    id: "hasSponsorsListing",
    name: "Has Sponsors Listing",
    category: "social",
    type: "boolean",
    description: "Whether the user has a GitHub Sponsors listing",
    requiresEnrichment: true,
  },
  {
    id: "orgCount",
    name: "Org Memberships",
    category: "social",
    type: "number",
    description: "Number of public organization memberships",
    requiresEnrichment: true,
  },

  // Content
  {
    id: "contentLanguage",
    name: "Content Language",
    category: "content",
    type: "string",
    description: "Detected dominant language of the content",
  },
  {
    id: "hasCryptoAddress",
    name: "Has Crypto Address",
    category: "content",
    type: "boolean",
    description: "Whether the content contains cryptocurrency addresses",
  },
  {
    id: "contentLength",
    name: "Content Length",
    category: "content",
    type: "number",
    description: "Length of the content text in characters",
  },
  {
    id: "filesChanged",
    name: "Files Changed",
    category: "content",
    type: "number",
    description: "Number of files changed in a pull request",
  },

  // Reputation
  {
    id: "score",
    name: "Contributor Score",
    category: "reputation",
    type: "number",
    description: "Tripwire contributor trust score (0-100)",
  },
  {
    id: "totalBlocks",
    name: "Total Blocks",
    category: "reputation",
    type: "number",
    description:
      "Total number of times this user has been blocked in this repo",
  },
  {
    id: "totalAllows",
    name: "Total Allows",
    category: "reputation",
    type: "number",
    description:
      "Total number of times this user has been allowed in this repo",
  },
  {
    id: "totalNearMisses",
    name: "Total Near Misses",
    category: "reputation",
    type: "number",
    description: "Total number of near-miss events for this user in this repo",
  },
  {
    id: "isWhitelisted",
    name: "Is Whitelisted",
    category: "reputation",
    type: "boolean",
    description: "Whether the user is on the repo whitelist",
  },
  {
    id: "isBlacklisted",
    name: "Is Blacklisted",
    category: "reputation",
    type: "boolean",
    description: "Whether the user is on the repo blacklist",
  },

  // Red Flags
  {
    id: "sprayBurstCount",
    name: "Spray Burst Count",
    category: "redFlags",
    type: "number",
    description: "Max PRs created in any 1-hour window",
    requiresEnrichment: true,
  },
  {
    id: "temporalRegularityCV",
    name: "Temporal Regularity CV",
    category: "redFlags",
    type: "number",
    description:
      "Coefficient of variation of PR creation intervals (lower = more mechanical)",
    requiresEnrichment: true,
  },
  {
    id: "autoMergeFarmMedianTime",
    name: "Auto-Merge Farm Median Time",
    category: "redFlags",
    type: "number",
    description: "Median time-to-merge in minutes across recent PRs",
    requiresEnrichment: true,
  },
  {
    id: "forkHeavy",
    name: "Fork Heavy",
    category: "redFlags",
    type: "boolean",
    description: "Whether the user has 50+ forks but 2 or fewer non-fork repos",
    requiresEnrichment: true,
  },

  // Badges
  {
    id: "isGitHubStar",
    name: "GitHub Star",
    category: "badges",
    type: "boolean",
    description: "Whether the user has the GitHub Star badge",
    requiresEnrichment: true,
  },
  {
    id: "isBountyHunter",
    name: "Bounty Hunter",
    category: "badges",
    type: "boolean",
    description: "Whether the user has the Bug Bounty Hunter badge",
    requiresEnrichment: true,
  },
  {
    id: "isDeveloperProgramMember",
    name: "Developer Program Member",
    category: "badges",
    type: "boolean",
    description: "Whether the user is a GitHub Developer Program member",
    requiresEnrichment: true,
  },
  {
    id: "isCampusExpert",
    name: "Campus Expert",
    category: "badges",
    type: "boolean",
    description: "Whether the user is a GitHub Campus Expert",
    requiresEnrichment: true,
  },
  {
    id: "isSiteAdmin",
    name: "Site Admin",
    category: "badges",
    type: "boolean",
    description: "Whether the user is a GitHub staff member",
    requiresEnrichment: true,
  },

  // Profile
  {
    id: "hasProfileReadme",
    name: "Has Profile README",
    category: "profile",
    type: "boolean",
    description: "Whether the user has a profile README",
    requiresEnrichment: true,
  },
  {
    id: "achievementCount",
    name: "Achievement Count",
    category: "profile",
    type: "number",
    description: "Number of GitHub achievements earned",
    requiresEnrichment: true,
  },
  {
    id: "socialAccountCount",
    name: "Social Account Count",
    category: "profile",
    type: "number",
    description: "Number of linked social accounts",
    requiresEnrichment: true,
  },
  {
    id: "contributionYears",
    name: "Contribution Years",
    category: "profile",
    type: "number",
    description: "Number of years with contribution activity",
    requiresEnrichment: true,
  },
] as const

export interface SignalCategoryInfo {
  id: SignalCategory
  name: string
}

export const SIGNAL_CATEGORIES: readonly SignalCategoryInfo[] = [
  { id: "account", name: "Account" },
  { id: "contributions", name: "Contributions" },
  { id: "social", name: "Social" },
  { id: "content", name: "Content" },
  { id: "reputation", name: "Reputation" },
  { id: "redFlags", name: "Red Flags" },
  { id: "badges", name: "Badges" },
  { id: "profile", name: "Profile" },
] as const

export type NumberOperator = ">" | ">=" | "<" | "<=" | "==" | "!="
export type BooleanOperator = "is" | "is not"
export type StringOperator = "equals" | "contains" | "matches" | "not_equals"
export type SignalOperator = NumberOperator | BooleanOperator | StringOperator

export function getSignalsByCategory(
  category: SignalCategory
): SignalDefinition[] {
  return SIGNAL_REGISTRY.filter((s) => s.category === category)
}

export function getOperatorsForType(type: SignalType): SignalOperator[] {
  switch (type) {
    case "number":
      return [">", ">=", "<", "<=", "==", "!="]
    case "boolean":
      return ["is", "is not"]
    case "string":
      return ["equals", "contains", "matches", "not_equals"]
  }
}
