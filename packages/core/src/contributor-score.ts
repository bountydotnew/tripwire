/**
 * Contributor trust score (0-100) based on GitHub profile signals,
 * Tripwire event history, and community standing.
 *
 * Four categories:
 * - globalReputation (0-40): account age, followers, merged PRs, closed PR merge ratio, non-fork public repos (capped), context-repo PRs, achievements
 * - communitySignals (0-30): orgs, sponsors, badges, social accounts, 2FA, bio
 * - repoHistory (0-20): tripwire events (allowed/blocked/near-miss ratio)
 * - redFlags (0 to -10): high blocked ratio, suspicious patterns
 */

import type { GitHubAchievement, GitHubUserGraphQL } from "@tripwire/github"

export interface ScoreInput {
  accountAgeDays: number
  followers: number
  following: number
  /** GitHub profile public_repo count (incl. forks); used for floors / display parity */
  publicRepos: number
  /** Public non-fork repos (search); primary repo substance signal */
  publicNonForkRepoCount: number
  /** Public fork repos (search); ratio / transparency */
  publicForkRepoCount: number
  /** PRs authored on the Tripwire-connected repo */
  contextRepoPrCount: number
  publicGists: number
  bio: string | null
  company: string | null
  location: string | null
  blog: string | null
  twitterUsername: string | null
  hasTwoFactor: boolean
  hasProfileReadme: boolean
  graphql: GitHubUserGraphQL | null
  achievements: GitHubAchievement[]
  mergedPrCount: number
  /** Total closed PRs authored (includes merged and closed-unmerged) */
  closedPrCount: number
  /** Closed PRs that were not merged (subset of closedPrCount) */
  closedUnmergedPrCount: number
  blockedCount: number
  allowedCount: number
  nearMissCount: number

  // ─── Change 1: PR substance (split volume from quality) ─────
  /** Summary of merged PRs with quality weighting. Null = use flat mergedPrCount. */
  mergedPrSummary?: {
    total: number
    /** Each PR's multiplier summed based on target repo quality tier */
    qualityWeightedCount: number
  } | null

  // ─── Change 2: Spray detection temporal data ────────────────
  /** Temporal PR data for spray pattern detection. Null = skip spray checks. */
  prTemporalData?: {
    /** Intervals in seconds between consecutive PR creation timestamps */
    creationIntervals: number[]
    /** Seconds between PR creation and merge, per PR */
    timeToMerge: number[]
    /** Distinct repos targeted across merged PRs */
    distinctRepoCount: number
    /** Max PRs created within any 1-hour sliding window */
    maxPrsInOneHourWindow: number
    /** Distinct repos in the densest 1-hour window */
    reposInDensestWindow: number
  } | null

  // ─── Change 3: Repo history with timestamps for decay ───────
  /** Timestamped events for time-decay scoring. Null = fall back to flat counts. */
  repoEvents?: Array<{
    type: "allowed" | "blocked" | "near-miss" | "cleared"
    createdAt: Date
  }> | null
}

export type ScoreCategory =
  | "globalReputation"
  | "communitySignals"
  | "repoHistory"
  | "redFlags"
  | "floor"

export interface ScoreLineItem {
  category: ScoreCategory
  reason: string
  delta: number
}

export interface ScoreResult {
  total: number
  globalReputation: number
  communitySignals: number
  repoHistory: number
  redFlags: number
  lineItems: ScoreLineItem[]
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
class CategoryBuilder {
  total = 0
  constructor(
    private readonly category: ScoreCategory,
    private readonly sink: ScoreLineItem[]
  ) {}
  add(reason: string, delta: number) {
    if (delta === 0) return
    this.total += delta
    this.sink.push({ category: this.category, reason, delta })
  }
}
const TIER_POINTS: Record<number, number> = {
  1: 1,
  2: 2,
  3: 4,
  4: 6,
}

const RARITY_MULTIPLIER: Record<string, number> = {
  starstruck: 2,
  "arctic-code-vault-contributor": 2,
  "pull-shark": 1.5,
  "galaxy-brain": 1.5,
  "public-sponsor": 1.5,
  "pair-extraordinaire": 1,
  "open-sourcerer": 1,
  "heart-on-your-sleeve": 1,
  "mars-2020-contributor": 2,
  yolo: 0.5,
  quickdraw: 0.5,
}

function achievementPoints(a: GitHubAchievement): number {
  const tierPts = TIER_POINTS[a.tier] ?? 1
  const rarity = RARITY_MULTIPLIER[a.type] ?? 1
  return tierPts * rarity
}
export function formatAccountAge(days: number): string {
  if (days < 30) return `${days}d`
  if (days < 365) return `${Math.floor(days / 30)}mo`
  const years = Math.floor(days / 365)
  const months = Math.floor((days % 365) / 30)
  return months > 0 ? `${years}y ${months}mo` : `${years}y`
}
interface CategoryScore {
  value: number
  lostToCap: number
}

function scoreGlobalReputation(
  input: ScoreInput,
  sink: ScoreLineItem[]
): CategoryScore {
  const b = new CategoryBuilder("globalReputation", sink)
  const days = input.accountAgeDays
  const ageLabel = formatAccountAge(days)
  b.add(
    `Account age ${ageLabel}`,
    days >= 5475
      ? 15
      : days >= 3650
        ? 12
        : days >= 1825
          ? 10
          : days >= 1095
            ? 8
            : days >= 365
              ? 5
              : days >= 90
                ? 2
                : 0
  )

  const f = input.followers
  b.add(
    `Followers ${f}`,
    f >= 500 ? 8 : f >= 100 ? 6 : f >= 20 ? 4 : f >= 5 ? 2 : 0
  )

  // Merged PR signal: split into volume (0-6) + substance (0-6) = 12 max
  const prs = input.mergedPrCount
  if (input.mergedPrSummary) {
    // Volume: raw count, compressed tiers (0-6)
    const vol = input.mergedPrSummary.total
    b.add(
      `Merged PR volume (${vol})`,
      vol >= 500
        ? 6
        : vol >= 200
          ? 5
          : vol >= 50
            ? 4
            : vol >= 10
              ? 3
              : vol >= 1
                ? 1
                : 0
    )
    // Substance: quality-weighted count (0-6)
    const wc = input.mergedPrSummary.qualityWeightedCount
    b.add(
      `Merged PR substance (weighted ${wc.toFixed(1)})`,
      wc >= 200
        ? 6
        : wc >= 75
          ? 5
          : wc >= 25
            ? 4
            : wc >= 5
              ? 3
              : wc >= 1
                ? 1
                : 0
    )
  } else {
    // Fallback: flat count (backward compat)
    b.add(
      `Merged PRs ${prs}`,
      prs >= 500
        ? 12
        : prs >= 200
          ? 10
          : prs >= 50
            ? 8
            : prs >= 10
              ? 5
              : prs >= 1
                ? 2
                : 0
    )
  }

  const repos = input.publicNonForkRepoCount
  b.add(
    `Non-fork public repos ${repos}`,
    repos >= 50 ? 4 : repos >= 20 ? 3 : repos >= 5 ? 2 : repos >= 1 ? 1 : 0
  )

  b.add(
    `Authored PRs to this repo (${input.contextRepoPrCount})`,
    input.contextRepoPrCount >= 5 ? 2 : input.contextRepoPrCount >= 1 ? 1 : 0
  )

  b.add(
    `Following ${input.following}`,
    input.following >= 50 ? 2 : input.following >= 10 ? 1 : 0
  )

  b.add(
    `Public gists ${input.publicGists}`,
    input.publicGists >= 5 ? 2 : input.publicGists >= 1 ? 1 : 0
  )

  const closed = input.closedPrCount
  if (closed >= 10) {
    const mergedRatio = input.mergedPrCount / closed
    const pct = Math.round(mergedRatio * 100)
    b.add(
      `Merged/closed PR ratio ${pct}% (${input.mergedPrCount}/${closed})`,
      mergedRatio >= 0.7
        ? 3
        : mergedRatio >= 0.55
          ? 2
          : mergedRatio >= 0.4
            ? 1
            : mergedRatio < 0.15
              ? -3
              : mergedRatio < 0.25
                ? -2
                : mergedRatio < 0.35
                  ? -1
                  : 0
    )
  }

  const raw = b.total
  const clamped = clamp(raw, 0, 40)
  return { value: clamped, lostToCap: Math.max(0, raw - clamped) }
}

function scoreCommunitySignals(
  input: ScoreInput,
  sink: ScoreLineItem[]
): CategoryScore {
  const b = new CategoryBuilder("communitySignals", sink)

  for (const a of input.achievements) {
    b.add(`Achievement: ${a.type} (tier ${a.tier})`, achievementPoints(a))
  }

  if (input.graphql?.sponsoringCount && input.graphql.sponsoringCount > 0) {
    b.add(`Sponsoring ${input.graphql.sponsoringCount} user(s)`, 4)
  }
  if (input.graphql?.sponsorsCount && input.graphql.sponsorsCount > 0) {
    b.add(`Has ${input.graphql.sponsorsCount} sponsor(s)`, 5)
  }
  if (input.graphql?.hasSponsorsListing) {
    b.add("Has GitHub Sponsors listing", 2)
  }

  const orgCount = input.graphql?.organizations.length ?? 0
  b.add(
    `Org memberships ${orgCount}`,
    orgCount >= 3 ? 3 : orgCount >= 1 ? 2 : 0
  )

  if (input.graphql?.isGitHubStar) b.add("GitHub Star badge", 4)
  if (input.graphql?.isBountyHunter) b.add("Bug Bounty Hunter badge", 3)
  if (input.graphql?.isDeveloperProgramMember)
    b.add("Developer Program member", 2)
  if (input.graphql?.isCampusExpert) b.add("Campus Expert", 2)
  if (input.graphql?.isSiteAdmin) b.add("GitHub Staff", 5)

  const socials = input.graphql?.socialAccounts.length ?? 0
  if (socials > 0) b.add(`Social accounts ${socials}`, Math.min(socials, 2))
  if (input.bio) b.add("Has bio", 1)
  if (input.company) b.add("Has company", 1)
  if (input.blog) b.add("Has blog", 1)
  if (input.twitterUsername) b.add("Has Twitter", 1)
  if (input.hasTwoFactor) b.add("2FA enabled", 2)
  if (input.hasProfileReadme) b.add("Has profile README", 1)

  const raw = b.total
  const clamped = clamp(raw, 0, 30)
  return { value: clamped, lostToCap: Math.max(0, raw - clamped) }
}

/** Time-decay multiplier: recent events weigh more. */
function eventDecayMultiplier(createdAt: Date): number {
  const ageDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000)
  if (ageDays <= 90) return 1.0
  if (ageDays <= 180) return 0.5
  if (ageDays <= 365) return 0.25
  return 0.1
}

function scoreRepoHistory(input: ScoreInput, sink: ScoreLineItem[]): number {
  // If timestamped events are available, use decay-weighted scoring
  if (input.repoEvents && input.repoEvents.length > 0) {
    const b = new CategoryBuilder("repoHistory", sink)
    b.add("Baseline", 10)

    let allowedPts = 0
    let blockedPts = 0
    let nearMissPts = 0
    let allowedCount = 0
    let blockedCount = 0
    let nearMissCount = 0

    // cleared events neutralize the most recent block
    const clearedCount = input.repoEvents.filter(
      (e) => e.type === "cleared"
    ).length
    let blocksToSkip = clearedCount

    // Process blocked events newest-first so cleared events cancel the most recent blocks
    const blockedEvents = input.repoEvents
      .filter((e) => e.type === "blocked")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())

    for (const event of blockedEvents) {
      if (blocksToSkip > 0) {
        blocksToSkip--
        continue
      }
      blockedCount++
      blockedPts += -3 * eventDecayMultiplier(event.createdAt)
    }

    for (const event of input.repoEvents) {
      if (event.type === "allowed") {
        allowedCount++
        allowedPts += 2 * eventDecayMultiplier(event.createdAt)
      } else if (event.type === "near-miss") {
        nearMissCount++
        nearMissPts += -1 * eventDecayMultiplier(event.createdAt)
      }
    }

    const cappedAllowed = Math.min(allowedPts, 10)
    if (cappedAllowed > 0) {
      b.add(
        `${allowedCount} allowed events (decay-weighted +${cappedAllowed.toFixed(1)}, cap 10)`,
        Math.round(cappedAllowed * 10) / 10
      )
    }
    if (blockedPts < 0) {
      b.add(
        `${blockedCount} blocked events (decay-weighted ${blockedPts.toFixed(1)})`,
        Math.round(blockedPts * 10) / 10
      )
    }
    if (nearMissPts < 0) {
      b.add(
        `${nearMissCount} near-miss events (decay-weighted ${nearMissPts.toFixed(1)})`,
        Math.round(nearMissPts * 10) / 10
      )
    }
    if (clearedCount > 0) {
      b.add(
        `${clearedCount} cleared event${clearedCount !== 1 ? "s" : ""} (blocks neutralized)`,
        0
      )
    }

    const raw = b.total
    const clamped = clamp(raw, 0, 20)
    if (raw !== clamped) {
      sink.push({
        category: "repoHistory",
        reason: `Clamped to [0, 20] (raw ${raw.toFixed(1)})`,
        delta: Math.round((clamped - raw) * 10) / 10,
      })
    }
    return clamped
  }

  // Fallback: flat counts (backward compat when repoEvents is null/empty)
  const total = input.blockedCount + input.allowedCount + input.nearMissCount

  if (total === 0) {
    sink.push({
      category: "repoHistory",
      reason: "No repo history (neutral baseline)",
      delta: 10,
    })
    return 10
  }

  const b = new CategoryBuilder("repoHistory", sink)
  b.add("Baseline", 10)

  const allowedPts = Math.min(input.allowedCount * 2, 10)
  if (allowedPts > 0) {
    b.add(`${input.allowedCount} allowed events (+2 each, cap 10)`, allowedPts)
  }

  if (input.blockedCount > 0) {
    b.add(
      `${input.blockedCount} blocked events (-3 each)`,
      -3 * input.blockedCount
    )
  }

  if (input.nearMissCount > 0) {
    b.add(
      `${input.nearMissCount} near-miss events (-1 each)`,
      -input.nearMissCount
    )
  }

  const raw = b.total
  const clamped = clamp(raw, 0, 20)
  if (raw !== clamped) {
    sink.push({
      category: "repoHistory",
      reason: `Clamped to [0, 20] (raw ${raw})`,
      delta: clamped - raw,
    })
  }
  return clamped
}

function scoreRedFlags(input: ScoreInput, sink: ScoreLineItem[]): number {
  const b = new CategoryBuilder("redFlags", sink)

  const total = input.blockedCount + input.allowedCount
  if (total > 0) {
    const blockedRatio = input.blockedCount / total
    const pct = Math.round(blockedRatio * 100)
    if (blockedRatio > 0.75) b.add(`Blocked ratio ${pct}%`, -8)
    else if (blockedRatio > 0.5) b.add(`Blocked ratio ${pct}%`, -5)
    else if (blockedRatio > 0.25) b.add(`Blocked ratio ${pct}%`, -3)
  }

  if (
    input.accountAgeDays < 30 &&
    input.mergedPrCount === 0 &&
    input.publicRepos <= 1
  ) {
    b.add("Brand-new account with no activity", -3)
  }

  if (
    input.followers === 0 &&
    input.following === 0 &&
    input.accountAgeDays < 365
  ) {
    b.add("Zero followers + zero following on new-ish account", -2)
  }

  if (input.closedPrCount >= 30) {
    const mergedRatio = input.mergedPrCount / input.closedPrCount
    const pct = Math.round(mergedRatio * 100)
    if (mergedRatio < 0.08)
      b.add(
        `Very low merge ratio ${pct}% across ${input.closedPrCount} PRs`,
        -3
      )
    else if (mergedRatio < 0.12)
      b.add(`Low merge ratio ${pct}% across ${input.closedPrCount} PRs`, -2)
  }

  if (input.publicForkRepoCount >= 50 && input.publicNonForkRepoCount <= 2) {
    b.add(
      `Fork-heavy profile (${input.publicForkRepoCount} forks, ${input.publicNonForkRepoCount} non-fork)`,
      -1
    )
  }

  // ─── Spray detection (requires prTemporalData) ──────────────
  if (input.prTemporalData) {
    const td = input.prTemporalData

    // Red Flag: Temporal Regularity (mechanical cadence)
    // Bots create PRs on clock-like intervals. Humans are noisy.
    // CV (coefficient of variation) < 0.15 = suspiciously uniform.
    if (td.creationIntervals.length >= 10) {
      const mean =
        td.creationIntervals.reduce((s, v) => s + v, 0) /
        td.creationIntervals.length
      if (mean > 0) {
        const variance =
          td.creationIntervals.reduce((s, v) => s + (v - mean) ** 2, 0) /
          td.creationIntervals.length
        const stddev = Math.sqrt(variance)
        const cv = stddev / mean
        if (cv < 0.15) {
          b.add(
            `Suspiciously regular PR cadence (CV ${cv.toFixed(2)} across ${td.creationIntervals.length} PRs)`,
            -3
          )
        }
      }
    }

    // Red Flag: Burst Spray
    // 5+ PRs in 1 hour across 3+ repos = spray, not a legitimate batch.
    if (td.maxPrsInOneHourWindow >= 5 && td.reposInDensestWindow >= 3) {
      b.add(
        `Burst spray: ${td.maxPrsInOneHourWindow} PRs in 1hr across ${td.reposInDensestWindow} repos`,
        -3
      )
    }

    // Red Flag: Auto-Merge Farm Signal
    // Median time-to-merge under 5 minutes across 10+ PRs = targeting auto-merge repos.
    if (td.timeToMerge.length >= 10) {
      const sorted = [...td.timeToMerge].sort((a, b) => a - b)
      const medianSeconds = sorted[Math.floor(sorted.length / 2)]
      const medianMinutes = medianSeconds / 60
      if (medianMinutes < 5) {
        b.add(
          `Median time-to-merge ${medianMinutes.toFixed(1)}min across ${td.timeToMerge.length} PRs (auto-merge farm signal)`,
          -2
        )
      }
    }
  }

  const raw = b.total
  const clamped = clamp(raw, -10, 0)
  if (raw !== clamped) {
    sink.push({
      category: "redFlags",
      reason: `Clamped to [-10, 0] (raw ${raw})`,
      delta: clamped - raw,
    })
  }
  return clamped
}
export function computeContributorScore(input: ScoreInput): ScoreResult {
  const lineItems: ScoreLineItem[] = []

  const gr = scoreGlobalReputation(input, lineItems)
  const cs = scoreCommunitySignals(input, lineItems)
  const globalReputation = gr.value
  const communitySignals = cs.value
  const repoHistory = scoreRepoHistory(input, lineItems)
  const redFlags = scoreRedFlags(input, lineItems)

  let raw = globalReputation + communitySignals + repoHistory + redFlags

  const capLosses = [gr.lostToCap, cs.lostToCap].filter((n) => n > 0)
  if (capLosses.length > 0) {
    const totalLost = capLosses.reduce((sum, n) => sum + n, 0)
    const bonus = totalLost / capLosses.length
    lineItems.push({
      category: "floor",
      reason: `Overflow bonus: avg of ${capLosses.length} cap losses (${totalLost} pts above caps)`,
      delta: bonus,
    })
    raw += bonus
  }

  if (input.accountAgeDays >= 3650 && input.publicRepos >= 1 && raw < 45) {
    lineItems.push({
      category: "floor",
      reason: "Longevity floor: 10+ years with activity",
      delta: 45 - raw,
    })
    raw = 45
  } else if (
    input.accountAgeDays >= 1825 &&
    input.publicRepos >= 3 &&
    raw < 35
  ) {
    lineItems.push({
      category: "floor",
      reason: "Longevity floor: 5+ years with 3+ repos",
      delta: 35 - raw,
    })
    raw = 35
  }

  const total = clamp(raw, 0, 100)
  if (raw !== total) {
    lineItems.push({
      category: "floor",
      reason: `Final clamp to [0, 100] (raw ${raw})`,
      delta: total - raw,
    })
  }

  return {
    total,
    globalReputation,
    communitySignals,
    repoHistory,
    redFlags,
    lineItems,
  }
}
