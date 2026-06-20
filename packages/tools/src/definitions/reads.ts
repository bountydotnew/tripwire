import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm"
import { z } from "zod"
import { createError } from "evlog"
import { db } from "@tripwire/db/client"
import {
  events,
  githubReputation,
  member,
  organization,
  organizations,
  repositories,
  type EventAction,
} from "@tripwire/db"
import { assertEventMember, assertRepoMember } from "@tripwire/core"
import { getInstallationToken } from "@tripwire/github"
import {
  type ScoreCategory,
  type ScoreInput,
  computeContributorScore,
  fetchContributorSignals,
  type GitHubUser,
  type UserSignals,
} from "@tripwire/core"
import { type AnyToolDefinition, defineTool, makeSpec } from "../registry"
import { requireRepoId } from "../helpers"

function usernameEq(column: unknown, username: string) {
  return sql`lower(${column}) = ${username.toLowerCase()}`
}

async function getTokenForRepo(repoId: string): Promise<string | null> {
  try {
    const [repo] = await db
      .select({ orgId: repositories.orgId })
      .from(repositories)
      .where(eq(repositories.id, repoId))
      .limit(1)
    if (!repo) return null
    const [org] = await db
      .select({ installationId: organizations.githubInstallationId })
      .from(organizations)
      .where(eq(organizations.id, repo.orgId))
      .limit(1)
    if (!org) return null
    return await getInstallationToken(org.installationId)
  } catch {
    return null
  }
}

const fmtDate = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
const listRepos = defineTool({
  name: "list_repos",
  description:
    "List GitHub repositories the caller can manage in Tripwire — every repo they own OR belong to via a workspace, across ALL their workspaces. Returns repo id (use this for other tools), full name, privacy, the owning GitHub org login, and the Tripwire workspace name. When the same repo name could exist in more than one workspace, disambiguate with workspaceName / orgLogin.",
  needsRepo: false,
  inputSchema: z.object({}),
  handler: async (_args, ctx) =>
    db
      .selectDistinct({
        id: repositories.id,
        fullName: repositories.fullName,
        name: repositories.name,
        isPrivate: repositories.isPrivate,
        orgId: repositories.orgId,
        orgLogin: organizations.githubAccountLogin,
        workspaceName: organization.name,
      })
      .from(repositories)
      .innerJoin(organizations, eq(repositories.orgId, organizations.id))
      .leftJoin(
        organization,
        eq(organizations.betterAuthOrgId, organization.id)
      )
      .leftJoin(
        member,
        and(
          eq(member.organizationId, organizations.betterAuthOrgId),
          eq(member.userId, ctx.userId)
        )
      )
      .where(or(eq(organizations.ownerId, ctx.userId), isNotNull(member.id)))
      .orderBy(repositories.fullName),
})
const listEvents = defineTool({
  name: "list_events",
  description:
    "List recent moderation events for the current repo (newest first). Filterable by username, action, severity.",
  directInvokable: true,
  inputSchema: z.object({
    username: z.string().optional(),
    action: z.string().optional(),
    severity: z.enum(["info", "warning", "error", "success"]).optional(),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  handler: async ({ username, action, severity, limit }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)

    const conditions = [eq(events.repoId, repoId)]
    if (username)
      conditions.push(usernameEq(events.targetGithubUsername, username))
    if (action) conditions.push(eq(events.action, action as EventAction))
    if (severity) conditions.push(eq(events.severity, severity))

    return db
      .select()
      .from(events)
      .where(and(...conditions))
      .orderBy(desc(events.createdAt))
      .limit(limit ?? 10)
  },
  chatRender: (rows) =>
    makeSpec("EventsList", {
      title: "Recent Events",
      events: rows.map((e) => ({
        id: e.id,
        action: e.action,
        severity: (e.severity ?? "info") as "info" | "warning" | "error",
        description: e.description ?? "",
        date: fmtDate(e.createdAt),
        username: e.targetGithubUsername,
      })),
    }),
})
const getEvent = defineTool({
  name: "get_event",
  description: "Fetch a single Tripwire event by id.",
  needsRepo: false,
  lazy: true,
  inputSchema: z.object({ eventId: z.string().uuid() }),
  handler: async ({ eventId }, ctx) => {
    const { event, repo } = await assertEventMember(ctx.userId, eventId)
    return { event, repo: { id: repo.id, fullName: repo.fullName } }
  },
  chatRender: ({ event }) =>
    makeSpec("EventCard", {
      id: event.id,
      action: event.action,
      severity: (event.severity ?? "info") as "info" | "warning" | "error",
      description: event.description ?? "",
      date: fmtDate(event.createdAt),
      username: event.targetGithubUsername,
    }),
})
// Used by both lookup_user (UserCard) and score_breakdown (ScoreBreakdown).

async function gatherUserSignals(
  username: string,
  userId: string,
  repoId: string
): Promise<UserSignals> {
  await assertRepoMember(userId, repoId)
  const token = await getTokenForRepo(repoId)
  return fetchContributorSignals({
    username,
    token,
    contextRepoId: repoId,
  })
}

async function lookupUserExecute(
  username: string,
  userId: string,
  repoId: string
): Promise<{
  ghUser: GitHubUser
  score: ReturnType<typeof computeContributorScore>
  badges: string[]
  status: "normal" | "blacklisted" | "whitelisted"
  repoId: string
  counts: {
    blockedCount: number
    allowedCount: number
    nearMissCount: number
    nonForkRepos: number
    forkRepos: number
    prsToThisRepo: number
    mergedPrs: number
    closedPrs: number
    closedUnmergedPrs: number
    accountAgeDays: number
  }
  profile: {
    profileReadme: boolean
    graphqlData: ScoreInput["graphql"]
    achievements: ScoreInput["achievements"]
  }
}> {
  const signals = await gatherUserSignals(username, userId, repoId)
  const score = computeContributorScore(signals.scoreInput)
  return {
    ghUser: signals.ghUser,
    score,
    badges: signals.badges,
    status: signals.status,
    repoId,
    counts: {
      blockedCount: signals.scoreInput.blockedCount,
      allowedCount: signals.scoreInput.allowedCount,
      nearMissCount: signals.scoreInput.nearMissCount,
      nonForkRepos: signals.scoreInput.publicNonForkRepoCount,
      forkRepos: signals.scoreInput.publicForkRepoCount,
      prsToThisRepo: signals.scoreInput.contextRepoPrCount,
      mergedPrs: signals.scoreInput.mergedPrCount,
      closedPrs: signals.scoreInput.closedPrCount,
      closedUnmergedPrs: signals.scoreInput.closedUnmergedPrCount,
      accountAgeDays: signals.scoreInput.accountAgeDays,
    },
    profile: {
      profileReadme: signals.scoreInput.hasProfileReadme,
      graphqlData: signals.scoreInput.graphql,
      achievements: signals.scoreInput.achievements,
    },
  }
}

function lookupOutputToSlideRecord(
  output: Awaited<ReturnType<typeof lookupUserExecute>>
) {
  return {
    username: output.ghUser.login,
    repoId: output.repoId,
    name: output.ghUser.name ?? null,
    avatar: output.ghUser.avatar_url ?? null,
    bio: output.ghUser.bio ?? null,
    company: output.ghUser.company ?? null,
    location: output.ghUser.location ?? null,
    publicRepos: output.ghUser.public_repos ?? 0,
    nonForkRepos: output.counts.nonForkRepos,
    forkRepos: output.counts.forkRepos,
    prsToThisRepo: output.counts.prsToThisRepo,
    followers: output.ghUser.followers ?? 0,
    following: output.ghUser.following ?? 0,
    accountAgeDays: output.counts.accountAgeDays,
    mergedPrs: output.counts.mergedPrs,
    closedPrs: output.counts.closedPrs,
    closedUnmergedPrs: output.counts.closedUnmergedPrs,
    hasProfileReadme: output.profile.profileReadme,
    hasTwoFactor: output.ghUser.two_factor_authentication ?? false,
    blockedCount: output.counts.blockedCount,
    allowedCount: output.counts.allowedCount,
    nearMissCount: output.counts.nearMissCount,
    orgs: output.profile.graphqlData?.organizations ?? [],
    sponsorsCount: output.profile.graphqlData?.sponsorsCount ?? 0,
    sponsoringCount: output.profile.graphqlData?.sponsoringCount ?? 0,
    achievements: output.profile.achievements,
    badges: output.badges,
    contributionsLastYear:
      output.profile.graphqlData?.contributionsLastYear ?? 0,
    contributorScore: output.score.total,
    status: output.status,
  }
}

function lookupOutputToSlideProps(
  output: Awaited<ReturnType<typeof lookupUserExecute>>
) {
  return makeSpec("UserCard", lookupOutputToSlideRecord(output))
}

const lookupUser = defineTool({
  name: "lookup_user",
  description:
    "Look up a GitHub user's profile and their Tripwire activity history for the current repo. Pass the username without @.",
  directInvokable: true,
  inputSchema: z.object({ username: z.string().min(1) }),
  handler: async ({ username }, ctx) => {
    const repoId = requireRepoId(ctx)
    return lookupUserExecute(username, ctx.userId, repoId)
  },
  chatRender: (output) => lookupOutputToSlideProps(output),
})
const lookupUsers = defineTool({
  name: "lookup_users",
  description:
    "Batch look-up of GitHub users for the current repo (profiles, Tripwire history, scores). Use when multiple logins appear together (slash /lookup @a @b or a list from the user).",
  directInvokable: true,
  inputSchema: z.object({
    usernames: z.array(z.string().min(1)).min(1).max(24),
  }),
  handler: async ({ usernames }, ctx) => {
    const repoId = requireRepoId(ctx)
    const ordered: string[] = []
    const seen = new Set<string>()
    for (const raw of usernames) {
      const u = raw.trim()
      if (!u) continue
      const key = u.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      ordered.push(u)
    }

    if (ordered.length === 0) {
      throw createError({
        code: "lookup.empty_usernames",
        status: 400,
        message: "No GitHub usernames to look up.",
      })
    }

    const rows = await Promise.all(
      ordered.map(async (login) => {
        try {
          const data = await lookupUserExecute(login, ctx.userId, repoId)
          return { ok: true as const, data }
        } catch (err: unknown) {
          const msg =
            err instanceof Error ? err.message : String(err ?? "Lookup failed.")
          return { ok: false as const, login, message: msg }
        }
      })
    )

    const successes = rows.flatMap((r) => (r.ok ? [r.data] : []))
    const errors = rows.flatMap((r) =>
      r.ok ? [] : [{ username: r.login, message: r.message }]
    )

    if (successes.length === 0) {
      throw createError({
        code: "lookup.batch_all_failed",
        status: 404,
        message: errors.map((e) => `@${e.username}: ${e.message}`).join(" · "),
        internal: { errors },
      })
    }

    return { successes, errors }
  },
  chatRender: (output) => {
    const slides = output.successes.map(lookupOutputToSlideRecord)
    if (slides.length === 1 && output.errors.length === 0) {
      return lookupOutputToSlideProps(output.successes[0]!)
    }
    return makeSpec("LookupUsersCarousel", {
      title: `Contributor lookup (${slides.length}${
        output.errors.length > 0 ? `, ${output.errors.length} failed` : ""
      })`,
      slides,
      ...(output.errors.length > 0 ? { errors: output.errors } : {}),
    })
  },
})

const CATEGORY_META: Record<
  ScoreCategory,
  { label: string; max: number | null }
> = {
  globalReputation: { label: "Global reputation", max: 40 },
  communitySignals: { label: "Community signals", max: 30 },
  repoHistory: { label: "Repo history", max: 20 },
  redFlags: { label: "Red flags", max: 0 },
  floor: { label: "Floor / clamp", max: null },
}

const scoreBreakdown = defineTool({
  name: "score_breakdown",
  description:
    "Explain a GitHub user's Tripwire contributor score by showing every contributing factor and its point delta. Use when the user asks why a score is what it is.",
  directInvokable: true,
  inputSchema: z.object({ username: z.string().min(1) }),
  handler: async ({ username }, ctx) => {
    const repoId = requireRepoId(ctx)
    const signals = await gatherUserSignals(username, ctx.userId, repoId)
    const score = computeContributorScore(signals.scoreInput)

    const subtotals: Record<ScoreCategory, number> = {
      globalReputation: score.globalReputation,
      communitySignals: score.communitySignals,
      repoHistory: score.repoHistory,
      redFlags: score.redFlags,
      floor: score.lineItems
        .filter((i) => i.category === "floor")
        .reduce((sum, i) => sum + i.delta, 0),
    }

    const order: ScoreCategory[] = [
      "globalReputation",
      "communitySignals",
      "repoHistory",
      "redFlags",
      "floor",
    ]

    const categories = order
      .map((id) => {
        const items = score.lineItems
          .filter((i) => i.category === id)
          .map(({ reason, delta }) => ({
            reason,
            delta,
            // For red flags, add a hint so the AI knows it can drill deeper
            ...(id === "redFlags" && delta < 0 ? { explainable: true } : {}),
          }))
        if (id === "floor" && items.length === 0) return null
        return {
          id,
          label: CATEGORY_META[id].label,
          subtotal: subtotals[id],
          max: CATEGORY_META[id].max,
          items,
        }
      })
      .filter((c): c is NonNullable<typeof c> => c !== null)

    return {
      username: signals.ghUser.login,
      total: score.total,
      categories,
    }
  },
  chatRender: (output) =>
    makeSpec("ScoreBreakdown", {
      username: output.username,
      total: output.total,
      categories: output.categories,
    }),
})
const explainScoreFlag = defineTool({
  name: "explain_score_flag",
  description:
    "Explain WHY a specific contributor score flag fired by returning the exact PRs, timestamps, and data that triggered it. Use when a user asks about a specific line item in their score (e.g., 'why did I get burst spray?' or 'explain the auto-merge farm signal'). Returns only the relevant subset of data, not the full PR list.",
  inputSchema: z.object({
    username: z.string().min(1).describe("GitHub username"),
    flag: z
      .string()
      .min(1)
      .describe(
        "The flag reason text or keyword (e.g., 'burst spray', 'cadence', 'auto-merge', 'blocked ratio', 'merge ratio', 'fork-heavy', 'brand-new')"
      ),
  }),
  handler: async ({ username, flag }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })

    const flagLower = flag.toLowerCase()
    const { fetchUserPRs } = await import("@tripwire/github/data-factory")

    // Determine which flag to explain and fetch ONLY the relevant evidence
    if (flagLower.includes("burst") || flagLower.includes("spray")) {
      // Burst spray: find the densest 1-hour window
      const prResult = await fetchUserPRs(token, username, {
        limit: 100,
        state: "merged",
      })
      const prs = prResult.items
      const timestamps = prs
        .map((pr, i) => ({ ts: new Date(pr.createdAt).getTime(), idx: i }))
        .sort((a, b) => a.ts - b.ts)

      const HOUR_MS = 3600_000
      let bestWindow: { start: number; count: number; prs: typeof prs } = {
        start: 0,
        count: 0,
        prs: [],
      }
      for (let i = 0; i < timestamps.length; i++) {
        const windowEnd = timestamps[i].ts + HOUR_MS
        const windowPrs = []
        for (
          let j = i;
          j < timestamps.length && timestamps[j].ts <= windowEnd;
          j++
        ) {
          windowPrs.push(prs[timestamps[j].idx])
        }
        if (windowPrs.length > bestWindow.count) {
          bestWindow = {
            start: timestamps[i].ts,
            count: windowPrs.length,
            prs: windowPrs,
          }
        }
      }

      const repos = [...new Set(bestWindow.prs.map((p) => p.repoFullName))]
      return {
        flag: "Burst Spray",
        summary: `${bestWindow.count} PRs opened within 1 hour across ${repos.length} repos`,
        evidence: bestWindow.prs.map((pr) => ({
          title: pr.title,
          number: pr.number,
          repo: pr.repoFullName,
          createdAt: pr.createdAt,
          mergedAt: pr.mergedAt,
          url: pr.htmlUrl,
        })),
        repos,
        windowStart: new Date(bestWindow.start).toISOString(),
        windowEnd: new Date(bestWindow.start + HOUR_MS).toISOString(),
      }
    }

    if (flagLower.includes("cadence") || flagLower.includes("regular")) {
      // Temporal regularity: show the intervals
      const prResult = await fetchUserPRs(token, username, {
        limit: 50,
        state: "merged",
      })
      const prs = prResult.items
      const timestamps = prs
        .map((pr) => new Date(pr.createdAt).getTime())
        .sort((a, b) => a - b)
      const intervals = []
      for (let i = 1; i < timestamps.length; i++) {
        intervals.push(Math.round((timestamps[i] - timestamps[i - 1]) / 1000))
      }
      const mean =
        intervals.length > 0
          ? intervals.reduce((s, v) => s + v, 0) / intervals.length
          : 0
      const variance =
        intervals.length > 0
          ? intervals.reduce((s, v) => s + (v - mean) ** 2, 0) /
            intervals.length
          : 0
      const cv = mean > 0 ? Math.sqrt(variance) / mean : 0

      return {
        flag: "Temporal Regularity",
        summary: `CV ${cv.toFixed(3)} across ${intervals.length} intervals (threshold: < 0.15 = suspicious)`,
        evidence: prs.slice(0, 15).map((pr) => ({
          title: pr.title,
          number: pr.number,
          repo: pr.repoFullName,
          createdAt: pr.createdAt,
          url: pr.htmlUrl,
        })),
        stats: {
          coefficientOfVariation: Math.round(cv * 1000) / 1000,
          meanIntervalSeconds: Math.round(mean),
          sampleSize: intervals.length,
          intervals: intervals.slice(0, 20), // first 20 intervals
        },
      }
    }

    if (
      flagLower.includes("auto-merge") ||
      flagLower.includes("merge farm") ||
      flagLower.includes("time-to-merge") ||
      flagLower.includes("time to merge")
    ) {
      // Auto-merge farm: show PRs with fastest merge times
      const prResult = await fetchUserPRs(token, username, {
        limit: 50,
        state: "merged",
      })
      const prs = prResult.items.filter((pr) => pr.timeToMergeMinutes != null)
      const sorted = prs.sort(
        (a, b) =>
          (a.timeToMergeMinutes ?? 999999) - (b.timeToMergeMinutes ?? 999999)
      )
      const fastest = sorted.slice(0, 10)
      const medianIdx = Math.floor(sorted.length / 2)
      const medianMinutes = sorted[medianIdx]?.timeToMergeMinutes ?? null

      return {
        flag: "Auto-Merge Farm Signal",
        summary: `Median time-to-merge: ${medianMinutes != null ? `${medianMinutes.toFixed(1)} minutes` : "unknown"} across ${sorted.length} merged PRs`,
        evidence: fastest.map((pr) => ({
          title: pr.title,
          number: pr.number,
          repo: pr.repoFullName,
          createdAt: pr.createdAt,
          mergedAt: pr.mergedAt,
          timeToMergeMinutes: pr.timeToMergeMinutes,
          url: pr.htmlUrl,
        })),
        stats: {
          medianMinutes,
          totalPrsWithMergeData: sorted.length,
          fastestMergeMinutes: sorted[0]?.timeToMergeMinutes ?? null,
        },
      }
    }

    if (flagLower.includes("blocked ratio") || flagLower.includes("block")) {
      // Blocked ratio: show the events
      const allEvents = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.repoId, repoId),
            usernameEq(events.targetGithubUsername, username)
          )
        )
      const blocked = allEvents.filter((e) => e.action === "pipeline_blocked")
      const allowed = allEvents.filter((e) => e.action === "pipeline_allowed")
      const ratio =
        blocked.length + allowed.length > 0
          ? blocked.length / (blocked.length + allowed.length)
          : 0

      return {
        flag: "Blocked Ratio",
        summary: `${blocked.length} blocked / ${allowed.length} allowed = ${Math.round(ratio * 100)}% blocked`,
        evidence: blocked.slice(0, 10).map((e) => ({
          action: e.action,
          description: e.description,
          rule: e.ruleName,
          date: e.createdAt.toISOString(),
          ref: e.githubRef,
        })),
        stats: {
          blockedCount: blocked.length,
          allowedCount: allowed.length,
          ratio: Math.round(ratio * 100),
        },
      }
    }

    if (flagLower.includes("merge ratio") || flagLower.includes("low merge")) {
      // Low merge ratio: show closed-unmerged PRs
      const prResult = await fetchUserPRs(token, username, {
        limit: 20,
        state: "closed",
      })
      const closedNotMerged = prResult.items.filter((pr) => !pr.mergedAt)
      return {
        flag: "Low Merge Ratio",
        summary: `${closedNotMerged.length} closed-without-merge PRs found in sample`,
        evidence: closedNotMerged.slice(0, 10).map((pr) => ({
          title: pr.title,
          number: pr.number,
          repo: pr.repoFullName,
          createdAt: pr.createdAt,
          closedAt: pr.closedAt,
          selfClosed: pr.selfClosed,
          url: pr.htmlUrl,
        })),
      }
    }

    if (flagLower.includes("fork") || flagLower.includes("fork-heavy")) {
      const { fetchUserRepos } = await import("@tripwire/github/data-factory")
      const repoResult = await fetchUserRepos(token, username, { limit: 25 })
      const forks = repoResult.items.filter((r) => r.isFork)
      const nonForks = repoResult.items.filter((r) => !r.isFork)
      return {
        flag: "Fork-Heavy Profile",
        summary: `${forks.length} forks vs ${nonForks.length} original repos`,
        evidence: forks.slice(0, 10).map((r) => ({
          name: r.fullName,
          url: r.htmlUrl,
          stars: r.stars,
          createdAt: r.createdAt,
        })),
      }
    }

    // Generic fallback: return the full score breakdown line items
    const signals = await gatherUserSignals(username, ctx.userId, repoId)
    const score = computeContributorScore(signals.scoreInput)
    const matching = score.lineItems.filter(
      (item) =>
        item.reason.toLowerCase().includes(flagLower) ||
        item.category.toLowerCase().includes(flagLower)
    )

    return {
      flag: flag,
      summary:
        matching.length > 0
          ? `Found ${matching.length} matching line item(s) in score`
          : `No exact match for "${flag}" — showing all red flags`,
      evidence: (matching.length > 0
        ? matching
        : score.lineItems.filter((i) => i.category === "redFlags")
      ).map((item) => ({
        category: item.category,
        reason: item.reason,
        delta: item.delta,
      })),
    }
  },
  chatRender: (output) => {
    // Return as plain Text since evidence shape varies per flag type
    const lines = [
      `**${output.flag}**`,
      output.summary,
      "",
      "**Evidence:**",
      ...(output.evidence as Array<Record<string, unknown>>)
        .slice(0, 10)
        .map((e, i) => {
          if ("title" in e)
            return `${i + 1}. ${e.title} (${e.repo}#${e.number}) — ${e.createdAt ? new Date(e.createdAt as string).toLocaleDateString() : ""}${e.timeToMergeMinutes != null ? ` — merged in ${e.timeToMergeMinutes}min` : ""}`
          if ("reason" in e) {
            const delta = typeof e.delta === "number" ? e.delta : 0
            return `• ${e.reason} → ${delta > 0 ? "+" : ""}${delta}`
          }
          if ("name" in e)
            return `• ${e.name}${e.stars ? ` (${e.stars}★)` : ""}`
          if ("action" in e)
            return `• ${e.description ?? e.action} (${e.date ? new Date(e.date as string).toLocaleDateString() : ""})`
          return `• ${JSON.stringify(e)}`
        }),
    ]
    if ((output as Record<string, unknown>).stats) {
      lines.push("", "**Stats:**")
      for (const [k, v] of Object.entries(
        (output as Record<string, unknown>).stats as Record<string, unknown>
      )) {
        lines.push(`• ${k}: ${v}`)
      }
    }
    return makeSpec("Text", { content: lines.join("\n") })
  },
})
const getReputationLeaderboard = defineTool({
  name: "get_reputation_leaderboard",
  description:
    "Show the most-blocked GitHub users across all events for the current repo. Use when asked about repeat offenders, most blocked users, or threat analysis.",
  surfaces: ["chat"],
  lazy: true,
  inputSchema: z.object({
    limit: z.number().int().min(1).max(25).optional(),
  }),
  handler: async ({ limit }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    return db
      .select()
      .from(githubReputation)
      .where(
        and(
          eq(githubReputation.repoId, repoId),
          sql`${githubReputation.totalBlocks} > 0`
        )
      )
      .orderBy(desc(githubReputation.totalBlocks))
      .limit(limit ?? 10)
  },
  chatRender: (rows) =>
    makeSpec("ReputationLeaderboard", {
      users: rows.map((r) => ({
        username: r.githubUsername,
        score: r.score,
        totalBlocks: r.totalBlocks,
        totalAllows: r.totalAllows,
        totalNearMisses: r.totalNearMisses,
        lastSeenAt: fmtDate(r.lastSeenAt),
      })),
    }),
})
const listWorkflows = defineTool({
  name: "list_workflows",
  description:
    "List all automation workflows for the current repo. Shows name, node count, and active/draft status.",
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const { workflows } = await import("@tripwire/db")
    const { desc } = await import("drizzle-orm")
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.repoId, repoId))
      .orderBy(desc(workflows.updatedAt))
    return rows.map((wf) => ({
      id: wf.id,
      name: wf.name,
      enabled: wf.enabled,
      nodeCount: ((wf.definition as { nodes: unknown[] }).nodes ?? []).length,
      updatedAt: wf.updatedAt.toISOString(),
    }))
  },
  chatRender: (output) => {
    if (output.length === 0) {
      return makeSpec("Text", { content: "No workflows found for this repo." })
    }
    const lines = output.map(
      (wf) =>
        `${wf.enabled ? "Active" : "Draft"} — **${wf.name}** (${wf.nodeCount} nodes, updated ${new Date(wf.updatedAt).toLocaleDateString()})`
    )
    return makeSpec("Text", { content: lines.join("\n") })
  },
})

const describeWorkflow = defineTool({
  name: "describe_workflow",
  description:
    "Describe a specific automation workflow — shows its trigger, rules, conditions, actions, and how they connect. Use when the user asks about a specific workflow.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Workflow name (or partial match)"),
  }),
  handler: async ({ name }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const { workflows } = await import("@tripwire/db")
    const { desc } = await import("drizzle-orm")
    const rows = await db
      .select()
      .from(workflows)
      .where(eq(workflows.repoId, repoId))
      .orderBy(desc(workflows.updatedAt))

    const nameLower = name.toLowerCase()
    const wf = rows.find((w) => w.name.toLowerCase().includes(nameLower))
    if (!wf) return { found: false, name }

    const def = wf.definition as unknown as {
      nodes: Array<Record<string, unknown>>
      edges: Array<Record<string, unknown>>
    }
    const nodes = def.nodes ?? []
    const edges = def.edges ?? []

    return {
      found: true,
      id: wf.id,
      name: wf.name,
      enabled: wf.enabled,
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
      })),
      edges: edges.map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
      })),
    }
  },
  chatRender: (output) => {
    if (!output.found) {
      return makeSpec("Text", {
        content: `No workflow matching "${output.name}" found.`,
      })
    }
    const nodes = output.nodes as Array<{
      id: string
      type: string
      data: Record<string, unknown>
    }>
    const lines = [
      `**${output.name}** (${output.enabled ? "Active" : "Draft"})`,
      "",
      ...nodes.map((n) => {
        const label =
          n.type === "trigger"
            ? `Trigger: ${n.data.trigger}`
            : n.type === "rule"
              ? `Rule: ${n.data.rule}${n.data.params ? ` (${JSON.stringify(n.data.params)})` : ""}`
              : n.type === "condition"
                ? `Condition: ${n.data.field} ${n.data.operator} ${n.data.value}`
                : n.type === "logic"
                  ? `Logic: ${n.data.gate}`
                  : n.type === "action"
                    ? `Action: ${n.data.action}${n.data.message ? ` — "${n.data.message}"` : ""}`
                    : n.type === "delay"
                      ? `Delay: ${n.data.duration}`
                      : n.type === "transform"
                        ? `Transform: ${n.data.transform}`
                        : n.type
        return `- ${label}`
      }),
    ]
    return makeSpec("Text", { content: lines.join("\n") })
  },
})
const getUserPrs = defineTool({
  name: "get_user_prs",
  description:
    "Fetch a GitHub user's pull requests with full details (title, repo, dates, merge status). Returns 5 merged PRs by default; use limit and state params to adjust.",
  inputSchema: z.object({
    username: z.string().min(1).describe("GitHub username"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Number of PRs to return (default 5)"),
    state: z
      .enum(["merged", "closed", "open", "all"])
      .optional()
      .describe("PR state filter (default merged)"),
  }),
  handler: async ({ username, limit, state }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })
    const { fetchUserPRs } = await import("@tripwire/github/data-factory")
    return fetchUserPRs(token, username, { limit, state })
  },
  chatRender: (output, args) =>
    makeSpec("PullRequestList", {
      username: args.username,
      prs: output.items.map((pr) => ({
        title: pr.title,
        number: pr.number,
        url: pr.htmlUrl,
        repo: pr.repoFullName,
        state: pr.mergedAt ? "merged" : pr.state,
        createdAt: pr.createdAt,
        mergedAt: pr.mergedAt,
        labels: pr.labels,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changedFiles,
        commits: pr.commits,
        timeToMergeMinutes: pr.timeToMergeMinutes,
      })),
      totalCount: output.totalCount,
      showing: output.items.length,
    }),
})

const getPrDetail = defineTool({
  name: "get_pr_detail",
  description:
    "Fetch full details for a single pull request: diff stats, file list, reviewers, commit messages, body, and timing. Provide the repo as 'owner/repo' and the PR number.",
  inputSchema: z.object({
    repo: z.string().min(1).describe("Repository in owner/repo format"),
    prNumber: z.number().int().min(1).describe("Pull request number"),
  }),
  handler: async ({ repo, prNumber }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })
    const [owner, repoName] = repo.split("/")
    if (!owner || !repoName)
      throw createError({
        code: "github.invalid_repo",
        message: "Repo must be in owner/repo format",
      })
    const { fetchPRDetail } = await import("@tripwire/github/data-factory")
    return fetchPRDetail(token, owner, repoName, prNumber)
  },
  chatRender: (output) =>
    makeSpec("PullRequestDetail", {
      title: output.pr.title,
      number: output.pr.number,
      url: output.pr.htmlUrl,
      repo: output.pr.repoFullName,
      state: output.pr.mergedAt ? "merged" : output.pr.state,
      author: output.pr.authorLogin,
      authorAvatar: output.pr.authorAvatar,
      createdAt: output.pr.createdAt,
      mergedAt: output.pr.mergedAt,
      additions: output.pr.additions,
      deletions: output.pr.deletions,
      changedFiles: output.pr.changedFiles,
      commits: output.pr.commits,
      timeToMergeMinutes: output.pr.timeToMergeMinutes,
      draft: output.pr.draft,
      body: output.pr.body,
      closedBy: output.pr.closedBy,
      selfClosed: output.pr.selfClosed,
      labels: output.pr.labels,
      files: output.files,
      reviewers: output.reviewers,
      commitMessages: output.commitMessages,
      comments: output.comments.map((c) => ({
        author: c.author,
        authorAvatar: c.authorAvatar,
        body: c.body,
        createdAt: c.createdAt,
        type: c.type,
      })),
    }),
})

const getComments = defineTool({
  name: "get_comments",
  description:
    "Fetch the comment thread from a GitHub issue or pull request. Bot messages are filtered out by default. Use include_bots to see them.",
  inputSchema: z.object({
    repo: z.string().min(1).describe("Repository in owner/repo format"),
    issue_number: z.number().int().min(1).describe("Issue or PR number"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Max comments to return (default 50)"),
    include_bots: z
      .boolean()
      .optional()
      .describe("Include bot comments (default false)"),
  }),
  handler: async ({ repo, issue_number, limit, include_bots }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })
    const [owner, repoName] = repo.split("/")
    if (!owner || !repoName)
      throw createError({
        code: "github.invalid_repo",
        message: "Repo must be in owner/repo format",
      })
    const { fetchComments } = await import("@tripwire/github/data-factory")
    return {
      repo,
      issueNumber: issue_number,
      ...(await fetchComments(token, owner, repoName, issue_number, {
        limit,
        includeBots: include_bots,
      })),
    }
  },
  chatRender: (output) =>
    makeSpec("CommentThread", {
      repo: output.repo,
      issueNumber: output.issueNumber,
      comments: output.comments.map((c) => ({
        author: c.author,
        authorAvatar: c.authorAvatar,
        body: c.body,
        createdAt: c.createdAt,
        type: c.type,
      })),
      totalCount: output.totalCount,
    }),
})

const getUserRepos = defineTool({
  name: "get_user_repos",
  description:
    "Fetch a GitHub user's repositories with stars, language, and descriptions. Returns 5 top repos by stars by default.",
  inputSchema: z.object({
    username: z.string().min(1).describe("GitHub username"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Number of repos to return (default 5)"),
  }),
  handler: async ({ username, limit }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })
    const { fetchUserRepos } = await import("@tripwire/github/data-factory")
    return fetchUserRepos(token, username, { limit })
  },
  chatRender: (output, args) =>
    makeSpec("RepoList", {
      username: args.username,
      repos: output.items.map((r) => ({
        name: r.name,
        fullName: r.fullName,
        url: r.htmlUrl,
        description: r.description,
        stars: r.stars,
        forks: r.forks,
        language: r.language,
        isFork: r.isFork,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        pushedAt: r.pushedAt,
        openIssuesCount: r.openIssuesCount,
        topics: r.topics,
        license: r.license,
        archived: r.archived,
      })),
      totalCount: output.totalCount,
      showing: output.items.length,
    }),
})

const getUserActivity = defineTool({
  name: "get_user_activity",
  description:
    "Fetch a GitHub user's contribution activity: total contributions, active years, pinned repos, and organization memberships.",
  inputSchema: z.object({
    username: z.string().min(1).describe("GitHub username"),
  }),
  handler: async ({ username }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoMember(ctx.userId, repoId)
    const token = await getTokenForRepo(repoId)
    if (!token)
      throw createError({
        code: "github.no_token",
        message: "No GitHub token available for this repo",
      })
    const { fetchUserActivity } = await import("@tripwire/github/data-factory")
    return fetchUserActivity(token, username)
  },
  chatRender: (output) =>
    makeSpec("ActivitySummary", {
      totalContributions: output.contributions?.totalContributions ?? 0,
      contributionYears: output.graphql?.contributionYears ?? [],
      pinned: output.pinned.map((p) => ({
        name: p.name,
        url: p.url,
        description: p.description,
        stars: p.stars,
        language: p.primaryLanguage?.name ?? null,
      })),
      orgs: output.graphql?.organizations ?? [],
    }),
})

// Every tool in this file is read-only (no DB writes, no GitHub mutations),
// so flag the whole set for read-only surfaces in one place.
export const readTools: AnyToolDefinition[] = [
  listRepos,
  listEvents,
  getEvent,
  lookupUser,
  lookupUsers,
  scoreBreakdown,
  getReputationLeaderboard,
  listWorkflows,
  describeWorkflow,
  getUserPrs,
  getPrDetail,
  getComments,
  getUserRepos,
  explainScoreFlag,
  getUserActivity,
].map((t) => ({ ...t, readOnly: true }) as AnyToolDefinition)
