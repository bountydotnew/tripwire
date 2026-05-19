import type { GitHubUserGraphQL } from "@tripwire/github"

export interface ResolverContext {
  senderLogin: string
  senderId: number
  prNumber?: number
}

export interface RepoReputationData {
  score: number
  totalBlocks: number
  totalAllows: number
  totalNearMisses: number
  isWhitelisted: boolean
  isBlacklisted: boolean
}

export interface EnrichmentData {
  graphql?: GitHubUserGraphQL | null
  hasProfileReadme?: boolean
  achievementCount?: number
  nonForkRepoCount?: number
  forkRepoCount?: number
  prTemporalData?: {
    creationIntervals: number[]
    timeToMerge: number[]
    maxPrsInOneHourWindow: number
  } | null
  filesChanged?: number
}

export function resolveSignals(
  _ctx: ResolverContext,
  ghUser: Record<string, unknown> | null,
  contentText: string | undefined,
  repoReputation: RepoReputationData | null,
  enrichmentData?: EnrichmentData
): Record<string, unknown> {
  const signals: Record<string, unknown> = {}

  if (ghUser) {
    const createdAt = ghUser.created_at as string | undefined
    signals.accountAgeDays = createdAt
      ? Math.floor(
          (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24)
        )
      : 0
    signals.accountType = (ghUser.type as string) ?? "User"
    signals.hasTwoFactor =
      (ghUser.two_factor_authentication as boolean) ?? false
    signals.hasBio = !!ghUser.bio
    signals.hasCompany = !!ghUser.company
    signals.hasBlog = !!ghUser.blog
    signals.hasTwitter = !!ghUser.twitter_username

    signals.publicRepos = (ghUser.public_repos as number) ?? 0
    signals.publicGists = (ghUser.public_gists as number) ?? 0
    signals.followers = (ghUser.followers as number) ?? 0
    signals.following = (ghUser.following as number) ?? 0
  } else {
    signals.accountAgeDays = 0
    signals.accountType = "User"
    signals.hasTwoFactor = false
    signals.hasBio = false
    signals.hasCompany = false
    signals.hasBlog = false
    signals.hasTwitter = false
    signals.publicRepos = 0
    signals.publicGists = 0
    signals.followers = 0
    signals.following = 0
  }

  signals.mergedPrs = 0
  signals.closedPrs = 0
  signals.mergeRatio = 0

  if (contentText !== undefined) {
    signals.contentLength = contentText.length
    signals.contentLanguage = "unknown"
    signals.hasCryptoAddress = false
  } else {
    signals.contentLength = 0
    signals.contentLanguage = "unknown"
    signals.hasCryptoAddress = false
  }

  signals.filesChanged = enrichmentData?.filesChanged ?? 0

  if (repoReputation) {
    signals.score = repoReputation.score
    signals.totalBlocks = repoReputation.totalBlocks
    signals.totalAllows = repoReputation.totalAllows
    signals.totalNearMisses = repoReputation.totalNearMisses
    signals.isWhitelisted = repoReputation.isWhitelisted
    signals.isBlacklisted = repoReputation.isBlacklisted
  } else {
    signals.score = 0
    signals.totalBlocks = 0
    signals.totalAllows = 0
    signals.totalNearMisses = 0
    signals.isWhitelisted = false
    signals.isBlacklisted = false
  }

  const gql = enrichmentData?.graphql
  if (gql) {
    signals.sponsorsCount = gql.sponsorsCount
    signals.sponsoringCount = gql.sponsoringCount
    signals.hasSponsorsListing = gql.hasSponsorsListing
    signals.orgCount = gql.organizations.length
    signals.contributionsLastYear = gql.contributionsLastYear
    signals.isGitHubStar = gql.isGitHubStar
    signals.isBountyHunter = gql.isBountyHunter
    signals.isDeveloperProgramMember = gql.isDeveloperProgramMember
    signals.isCampusExpert = gql.isCampusExpert
    signals.isSiteAdmin = gql.isSiteAdmin
    signals.socialAccountCount = gql.socialAccounts.length
    signals.contributionYears = gql.contributionYears.length
  } else {
    signals.sponsorsCount = 0
    signals.sponsoringCount = 0
    signals.hasSponsorsListing = false
    signals.orgCount = 0
    signals.contributionsLastYear = 0
    signals.isGitHubStar = false
    signals.isBountyHunter = false
    signals.isDeveloperProgramMember = false
    signals.isCampusExpert = false
    signals.isSiteAdmin = false
    signals.socialAccountCount = 0
    signals.contributionYears = 0
  }

  signals.hasProfileReadme = enrichmentData?.hasProfileReadme ?? false
  signals.achievementCount = enrichmentData?.achievementCount ?? 0
  signals.nonForkRepos = enrichmentData?.nonForkRepoCount ?? 0
  signals.forkRepos = enrichmentData?.forkRepoCount ?? 0

  const td = enrichmentData?.prTemporalData
  signals.sprayBurstCount = td?.maxPrsInOneHourWindow ?? 0

  if (td && td.creationIntervals.length >= 2) {
    const mean =
      td.creationIntervals.reduce((s, v) => s + v, 0) /
      td.creationIntervals.length
    if (mean > 0) {
      const variance =
        td.creationIntervals.reduce((s, v) => s + (v - mean) ** 2, 0) /
        td.creationIntervals.length
      signals.temporalRegularityCV = Math.sqrt(variance) / mean
    } else {
      signals.temporalRegularityCV = 0
    }
  } else {
    signals.temporalRegularityCV = 0
  }

  if (td && td.timeToMerge.length > 0) {
    const sorted = [...td.timeToMerge].sort((a, b) => a - b)
    signals.autoMergeFarmMedianTime = sorted[Math.floor(sorted.length / 2)] / 60
  } else {
    signals.autoMergeFarmMedianTime = 0
  }

  const forkCount = enrichmentData?.forkRepoCount ?? 0
  const nonForkCount = enrichmentData?.nonForkRepoCount ?? 0
  signals.forkHeavy = forkCount >= 50 && nonForkCount <= 2

  return signals
}
