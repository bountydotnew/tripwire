import { z } from "zod"
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { authedProcedure } from "../init"
import { assertRepoOwner, logEvent } from "@tripwire/core"
import { getInstallationToken, githubApi } from "@tripwire/github"
import { trpcError } from "../error"
import { db } from "@tripwire/db/client"
import {
  events,
  githubReputation,
  githubResponseCache,
  whitelistEntries,
  blacklistEntries,
  visibilitySyncRuns,
  organizations,
  repositories,
  user,
  type EventAction,
  type EventSeverity,
} from "@tripwire/db"
import { inngest } from "#/inngest/client"
import { isValidGithubLogin } from "#/lib/github/login-validation"
import {
  type FeedCategory,
  type FeedEvent,
  type RawGitHubEvent,
  ACTIVITY_ACTIONS,
  SECURITY_ACTIONS,
  TRIPWIRE_ACTION_SEVERITY,
  collapsePushEvents,
  feedTitleForAction,
  formatGitHubEvent,
  tripwireIcon,
} from "#/lib/github/repo-events"
import {
  blacklistJoinClause,
  excludeMaintainerSelf,
  excludeRepoOwner,
  lowerInArray,
  whitelistJoinClause,
} from "#/lib/visibility-queries"
import type { TRPCRouterRecord } from "@trpc/server"

const sortColumnEnum = z.enum([
  "score",
  "lastSeen",
  "firstSeen",
  "blocks",
  "allows",
  "nearMisses",
])

const statusEnum = z.enum(["whitelisted", "blacklisted", "normal"])

type Status = z.infer<typeof statusEnum>

interface ContributorRow {
  githubUsername: string
  githubUserId: number | null
  avatarUrl: string | null
  score: number
  totalAllows: number
  totalBlocks: number
  totalNearMisses: number
  firstSeenAt: Date
  lastSeenAt: Date
  status: Status
}

const githubUsernameSchema = z
  .string()
  .min(1)
  .refine(isValidGithubLogin, "Invalid GitHub username")

const SORT_COLUMN = {
  score: githubReputation.score,
  lastSeen: githubReputation.lastSeenAt,
  firstSeen: githubReputation.firstSeenAt,
  blocks: githubReputation.totalBlocks,
  allows: githubReputation.totalAllows,
  nearMisses: githubReputation.totalNearMisses,
} as const

const BULK_ACTIONS = {
  whitelist: {
    mode: "add" as const,
    table: whitelistEntries,
    opposite: blacklistEntries,
    eventAction: "whitelist_added" as EventAction,
    eventSeverity: "info" as EventSeverity,
    verb: "added to the whitelist",
  },
  blacklist: {
    mode: "add" as const,
    table: blacklistEntries,
    opposite: whitelistEntries,
    eventAction: "blacklist_added" as EventAction,
    eventSeverity: "warning" as EventSeverity,
    verb: "added to the blacklist",
  },
  removeWhitelist: {
    mode: "remove" as const,
    table: whitelistEntries,
    eventAction: "whitelist_removed" as EventAction,
    eventSeverity: "info" as EventSeverity,
    verb: "removed from the whitelist",
  },
  removeBlacklist: {
    mode: "remove" as const,
    table: blacklistEntries,
    eventAction: "blacklist_removed" as EventAction,
    eventSeverity: "info" as EventSeverity,
    verb: "removed from the blacklist",
  },
} as const

type BulkActionKey = keyof typeof BULK_ACTIONS

export const visibilityRouter = {
  listContributors: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        search: z.string().max(80).optional(),
        sort: sortColumnEnum.default("score"),
        dir: z.enum(["asc", "desc"]).default("desc"),
        status: statusEnum.optional(),
        scoreMin: z.number().int().min(-100).max(100).optional(),
        scoreMax: z.number().int().min(-100).max(100).optional(),
        sinceDays: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)

      const conditions = [eq(githubReputation.repoId, input.repoId)]
      if (input.search) {
        conditions.push(
          sql`lower(${githubReputation.githubUsername}) like ${`%${input.search.toLowerCase()}%`}`
        )
      }
      if (typeof input.scoreMin === "number") {
        conditions.push(gte(githubReputation.score, input.scoreMin))
      }
      if (typeof input.scoreMax === "number") {
        conditions.push(sql`${githubReputation.score} <= ${input.scoreMax}`)
      }
      if (input.sinceDays) {
        const since = new Date()
        since.setDate(since.getDate() - input.sinceDays)
        conditions.push(gte(githubReputation.lastSeenAt, since))
      }
      if (input.status === "whitelisted") {
        conditions.push(sql`${whitelistEntries.id} is not null`)
      } else if (input.status === "blacklisted") {
        conditions.push(sql`${blacklistEntries.id} is not null`)
      } else if (input.status === "normal") {
        conditions.push(sql`${whitelistEntries.id} is null`)
        conditions.push(sql`${blacklistEntries.id} is null`)
      }

      const sortCol = SORT_COLUMN[input.sort]
      const orderBy =
        input.dir === "asc"
          ? [asc(sortCol), asc(githubReputation.githubUsername)]
          : [desc(sortCol), asc(githubReputation.githubUsername)]

      const rows = await db
        .select({
          githubUsername: githubReputation.githubUsername,
          githubUserId: githubReputation.githubUserId,
          score: githubReputation.score,
          totalAllows: githubReputation.totalAllows,
          totalBlocks: githubReputation.totalBlocks,
          totalNearMisses: githubReputation.totalNearMisses,
          firstSeenAt: githubReputation.firstSeenAt,
          lastSeenAt: githubReputation.lastSeenAt,
          whitelistAvatar: whitelistEntries.avatarUrl,
          blacklistAvatar: blacklistEntries.avatarUrl,
          isWhitelisted: sql<boolean>`${whitelistEntries.id} is not null`,
          isBlacklisted: sql<boolean>`${blacklistEntries.id} is not null`,
        })
        .from(githubReputation)
        .leftJoin(whitelistEntries, whitelistJoinClause(input.repoId))
        .leftJoin(blacklistEntries, blacklistJoinClause(input.repoId))
        .where(and(...conditions))
        .orderBy(...orderBy)
        .limit(input.limit + 1)
        .offset(input.offset)

      const filtered: ContributorRow[] = rows.map((r) => ({
        githubUsername: r.githubUsername,
        githubUserId: r.githubUserId,
        avatarUrl: r.whitelistAvatar ?? r.blacklistAvatar ?? null,
        score: r.score,
        totalAllows: r.totalAllows,
        totalBlocks: r.totalBlocks,
        totalNearMisses: r.totalNearMisses,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
        status: r.isBlacklisted
          ? "blacklisted"
          : r.isWhitelisted
            ? "whitelisted"
            : "normal",
      }))

      const hasMore = filtered.length > input.limit
      const items = filtered.slice(0, input.limit)

      const [totalRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(githubReputation)
        .leftJoin(whitelistEntries, whitelistJoinClause(input.repoId))
        .leftJoin(blacklistEntries, blacklistJoinClause(input.repoId))
        .where(and(...conditions))

      return {
        items,
        total: totalRow?.count ?? 0,
        nextOffset: hasMore ? input.offset + input.limit : null,
      }
    }),

  bulkAction: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        usernames: z.array(githubUsernameSchema).min(1).max(100),
        action: z.enum([
          "whitelist",
          "blacklist",
          "removeWhitelist",
          "removeBlacklist",
        ]),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)

      const config = BULK_ACTIONS[input.action satisfies BulkActionKey]

      const repRows = await db
        .select({
          githubUsername: githubReputation.githubUsername,
          githubUserId: githubReputation.githubUserId,
        })
        .from(githubReputation)
        .where(
          and(
            eq(githubReputation.repoId, input.repoId),
            lowerInArray(githubReputation.githubUsername, input.usernames)
          )
        )

      if (repRows.length === 0) {
        throw trpcError({
          message: "No matching contributors found for this repo",
          trpcCode: "NOT_FOUND",
        })
      }

      const usernames = repRows.map((r) => r.githubUsername)
      const actor = ctx.user.name ?? ctx.user.id

      const affected =
        config.mode === "remove"
          ? await removeFromList({
              repoId: input.repoId,
              table: config.table,
              usernames,
            })
          : await addToList({
              repoId: input.repoId,
              addedById: ctx.user.id,
              rows: repRows,
              table: config.table,
              opposite: config.opposite,
            })

      await Promise.all(
        affected.map((username) =>
          logEvent({
            repoId: input.repoId,
            action: config.eventAction,
            severity: config.eventSeverity,
            description: `@${username} was ${config.verb}`,
            targetGithubUsername: username,
            targetGithubUserId:
              repRows.find(
                (r) => r.githubUsername.toLowerCase() === username.toLowerCase()
              )?.githubUserId ?? undefined,
            metadata: { actor, source: "visibility_bulk" },
          })
        )
      )

      return { count: affected.length }
    }),

  suggestedWhitelist: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        scoreThreshold: z.number().int().min(0).max(100).default(75),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)
      const myGithubUserId = await getCurrentUserGithubId(ctx.user.id)

      const rows = await db
        .select({
          githubUsername: githubReputation.githubUsername,
          githubUserId: githubReputation.githubUserId,
          score: githubReputation.score,
          totalAllows: githubReputation.totalAllows,
          totalBlocks: githubReputation.totalBlocks,
          lastSeenAt: githubReputation.lastSeenAt,
          isWhitelisted: sql<boolean>`${whitelistEntries.id} is not null`,
          isBlacklisted: sql<boolean>`${blacklistEntries.id} is not null`,
        })
        .from(githubReputation)
        .innerJoin(repositories, eq(repositories.id, githubReputation.repoId))
        .innerJoin(organizations, eq(organizations.id, repositories.orgId))
        .leftJoin(whitelistEntries, whitelistJoinClause(input.repoId))
        .leftJoin(blacklistEntries, blacklistJoinClause(input.repoId))
        .where(
          and(
            eq(githubReputation.repoId, input.repoId),
            gte(githubReputation.score, input.scoreThreshold),
            gte(githubReputation.totalAllows, 1),
            excludeRepoOwner,
            excludeMaintainerSelf(myGithubUserId)
          )
        )
        .orderBy(desc(githubReputation.score))
        .limit(input.limit * 3)

      return rows
        .filter((r) => !r.isWhitelisted && !r.isBlacklisted)
        .slice(0, input.limit)
        .map((r) => ({
          githubUsername: r.githubUsername,
          githubUserId: r.githubUserId,
          score: r.score,
          totalAllows: r.totalAllows,
          totalBlocks: r.totalBlocks,
          lastSeenAt: r.lastSeenAt,
        }))
    }),

  riskAlerts: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        scoreThreshold: z.number().int().min(0).max(100).default(40),
        sinceDays: z.number().int().min(1).max(90).default(14),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)
      const myGithubUserId = await getCurrentUserGithubId(ctx.user.id)

      const since = new Date()
      since.setDate(since.getDate() - input.sinceDays)

      const rows = await db
        .select({
          githubUsername: githubReputation.githubUsername,
          githubUserId: githubReputation.githubUserId,
          score: githubReputation.score,
          totalBlocks: githubReputation.totalBlocks,
          totalNearMisses: githubReputation.totalNearMisses,
          lastSeenAt: githubReputation.lastSeenAt,
        })
        .from(githubReputation)
        .innerJoin(repositories, eq(repositories.id, githubReputation.repoId))
        .innerJoin(organizations, eq(organizations.id, repositories.orgId))
        .leftJoin(whitelistEntries, whitelistJoinClause(input.repoId))
        .leftJoin(blacklistEntries, blacklistJoinClause(input.repoId))
        .where(
          and(
            eq(githubReputation.repoId, input.repoId),
            sql`${githubReputation.score} <= ${input.scoreThreshold}`,
            gte(githubReputation.lastSeenAt, since),
            sql`${whitelistEntries.id} is null`,
            sql`${blacklistEntries.id} is null`,
            eq(githubReputation.totalAllows, 0),
            excludeRepoOwner,
            excludeMaintainerSelf(myGithubUserId)
          )
        )
        .orderBy(desc(githubReputation.lastSeenAt))
        .limit(input.limit)

      return rows.map((r) => ({
        githubUsername: r.githubUsername,
        githubUserId: r.githubUserId,
        score: r.score,
        totalBlocks: r.totalBlocks,
        totalNearMisses: r.totalNearMisses,
        lastSeenAt: r.lastSeenAt,
        isWhitelisted: false,
      }))
    }),

  syncStatus: authedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)
      const [latest] = await db
        .select({
          id: visibilitySyncRuns.id,
          status: visibilitySyncRuns.status,
          startedAt: visibilitySyncRuns.startedAt,
          completedAt: visibilitySyncRuns.completedAt,
          createdAt: visibilitySyncRuns.createdAt,
          stats: visibilitySyncRuns.stats,
          errorMessage: visibilitySyncRuns.errorMessage,
        })
        .from(visibilitySyncRuns)
        .where(eq(visibilitySyncRuns.repoId, input.repoId))
        .orderBy(desc(visibilitySyncRuns.createdAt))
        .limit(1)
      return { lastRun: latest ?? null }
    }),

  requestSync: authedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)

      const [active] = await db
        .select({ id: visibilitySyncRuns.id })
        .from(visibilitySyncRuns)
        .where(
          and(
            eq(visibilitySyncRuns.repoId, input.repoId),
            inArray(visibilitySyncRuns.status, ["queued", "running"])
          )
        )
        .orderBy(desc(visibilitySyncRuns.createdAt))
        .limit(1)
      if (active) {
        return { runId: active.id, alreadyRunning: true }
      }

      const [created] = await db
        .insert(visibilitySyncRuns)
        .values({
          repoId: input.repoId,
          status: "queued",
          requestedById: ctx.user.id,
        })
        .returning({ id: visibilitySyncRuns.id })
      if (!created) {
        throw trpcError({
          code: "visibility.sync_enqueue_failed",
          status: 500,
          message: "Failed to enqueue sync run",
        })
      }

      await inngest.send({
        name: "visibility/sync.requested",
        data: { runId: created.id },
      })

      return { runId: created.id, alreadyRunning: false }
    }),

  feed: authedProcedure
    .input(
      z.object({
        repoId: z.uuid(),
        limit: z.number().int().min(1).max(100).default(25),
        category: z.enum(["all", "security", "activity"]).default("all"),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)
      return fetchTripwireFeedEvents(input.repoId, input.limit, input.category)
    }),

  /**
   * Raw GitHub repo activity (pushes, stars, forks, releases, PR/issue
   * closes, etc.) from the Events API. Cached server-side so only one
   * caller every 60s actually hits GitHub; everyone else reads the cache.
   * Best-effort: falls back to stale cache (or empty) on any failure.
   */
  githubActivity: authedProcedure
    .input(
      z.object({
        repoId: z.uuid(),
        limit: z.number().int().min(1).max(100).default(25),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)

      const [repo] = await db
        .select({ fullName: repositories.fullName, orgId: repositories.orgId })
        .from(repositories)
        .where(eq(repositories.id, input.repoId))
        .limit(1)
      if (!repo) {
        throw trpcError({
          code: "visibility.repo_not_found",
          status: 404,
          message: "Repository not found",
        })
      }

      const raw = await getCachedGitHubRepoEvents(
        repo.orgId,
        repo.fullName,
        input.limit
      )

      const cutoff = Date.now() - FEED_WINDOW_MS
      const formatted: FeedEvent[] = []
      for (const entry of raw) {
        if (new Date(entry.created_at).getTime() < cutoff) continue
        const event = formatGitHubEvent(entry, repo.fullName)
        if (event) formatted.push(event)
      }
      return collapsePushEvents(formatted).slice(0, input.limit)
    }),
} satisfies TRPCRouterRecord

/**
 * Read recent Tripwire events for the repo, narrowed to the requested
 * category and the `FEED_WINDOW_MS` time window, and normalize them into
 * `FeedEvent`s.
 */
async function fetchTripwireFeedEvents(
  repoId: string,
  limit: number,
  category: FeedCategory
): Promise<FeedEvent[]> {
  const since = new Date(Date.now() - FEED_WINDOW_MS)
  const conditions = [eq(events.repoId, repoId), gte(events.createdAt, since)]
  if (category === "security") {
    conditions.push(inArray(events.action, [...SECURITY_ACTIONS]))
  } else if (category === "activity") {
    conditions.push(inArray(events.action, [...ACTIVITY_ACTIONS]))
  }

  const rows = await db
    .select()
    .from(events)
    .where(and(...conditions))
    .orderBy(desc(events.createdAt))
    .limit(limit)

  return rows.map((row) => ({
    id: row.id,
    source: "tripwire" as const,
    timestamp: row.createdAt.toISOString(),
    icon: tripwireIcon(row.action),
    title: feedTitleForAction(row.action),
    body: row.description,
    actor: row.targetGithubUsername
      ? {
          username: row.targetGithubUsername,
          avatarUrl: row.targetGithubUserId
            ? `https://avatars.githubusercontent.com/u/${row.targetGithubUserId}?v=4&s=48`
            : `https://github.com/${row.targetGithubUsername}.png?size=48`,
        }
      : null,
    severity: TRIPWIRE_ACTION_SEVERITY[row.action] ?? "info",
    githubRef: row.githubRef,
    eventId: row.id,
    url: null,
  }))
}

const GITHUB_EVENTS_TTL_MS = 60_000

/** Activity feed only surfaces events from the last 30 days. */
const FEED_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Read the repo's raw GitHub events with a 60s read-through cache backed
 * by `github_response_cache`. Only the first caller in each window hits
 * GitHub; the rest read the cached payload. On any failure we serve the
 * last cached payload if we have one, else an empty list — the feed
 * never breaks on a GitHub hiccup.
 */
async function getCachedGitHubRepoEvents(
  orgId: string,
  fullName: string,
  limit: number
): Promise<RawGitHubEvent[]> {
  const cacheKey = `repo_events:${fullName.toLowerCase()}`
  const now = Date.now()

  const [cached] = await db
    .select({
      payloadJson: githubResponseCache.payloadJson,
      freshUntil: githubResponseCache.freshUntil,
    })
    .from(githubResponseCache)
    .where(eq(githubResponseCache.cacheKey, cacheKey))
    .limit(1)

  if (cached && cached.freshUntil > now) {
    return safeParseEvents(cached.payloadJson)
  }

  try {
    const [org] = await db
      .select({ installationId: organizations.githubInstallationId })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1)
    if (!org) return cached ? safeParseEvents(cached.payloadJson) : []

    const token = await getInstallationToken(org.installationId)
    const perPage = Math.min(limit * 2, 100)
    // Hard 6s cap so a slow GitHub response can't stall the request.
    const raw = await githubApi(
      `/repos/${fullName}/events?per_page=${perPage}`,
      token,
      { signal: AbortSignal.timeout(6_000) }
    )
    if (!Array.isArray(raw)) {
      return cached ? safeParseEvents(cached.payloadJson) : []
    }

    const payloadJson = JSON.stringify(raw)
    await db
      .insert(githubResponseCache)
      .values({
        cacheKey,
        scope: fullName,
        resource: "repo_events",
        paramsJson: JSON.stringify({ perPage }),
        payloadJson,
        fetchedAt: now,
        freshUntil: now + GITHUB_EVENTS_TTL_MS,
        statusCode: 200,
      })
      .onConflictDoUpdate({
        target: githubResponseCache.cacheKey,
        set: {
          payloadJson,
          fetchedAt: now,
          freshUntil: now + GITHUB_EVENTS_TTL_MS,
          statusCode: 200,
        },
      })

    return raw as RawGitHubEvent[]
  } catch (err) {
    console.error(`[visibility.githubActivity] fetch failed: ${fullName}`, err)
    // Stale-on-error: better to show slightly old activity than nothing.
    return cached ? safeParseEvents(cached.payloadJson) : []
  }
}

function safeParseEvents(payloadJson: string): RawGitHubEvent[] {
  try {
    const parsed = JSON.parse(payloadJson)
    return Array.isArray(parsed) ? (parsed as RawGitHubEvent[]) : []
  } catch {
    return []
  }
}

type ListTable = typeof whitelistEntries | typeof blacklistEntries

async function removeFromList(opts: {
  repoId: string
  table: ListTable
  usernames: string[]
}): Promise<string[]> {
  await db
    .delete(opts.table)
    .where(
      and(
        eq(opts.table.repoId, opts.repoId),
        lowerInArray(opts.table.githubUsername, opts.usernames)
      )
    )
  return opts.usernames
}

async function addToList(opts: {
  repoId: string
  addedById: string
  rows: Array<{ githubUsername: string; githubUserId: number | null }>
  table: ListTable
  opposite: ListTable
}): Promise<string[]> {
  const inserted = await db.transaction(async (tx) => {
    await tx.delete(opts.opposite).where(
      and(
        eq(opts.opposite.repoId, opts.repoId),
        lowerInArray(
          opts.opposite.githubUsername,
          opts.rows.map((r) => r.githubUsername)
        )
      )
    )
    return tx
      .insert(opts.table)
      .values(
        opts.rows.map((r) => ({
          repoId: opts.repoId,
          githubUsername: r.githubUsername,
          githubUserId: r.githubUserId,
          avatarUrl: null,
          addedById: opts.addedById,
        }))
      )
      .onConflictDoNothing()
      .returning({ githubUsername: opts.table.githubUsername })
  })
  return inserted.map((r) => r.githubUsername)
}

async function getCurrentUserGithubId(userId: string): Promise<number | null> {
  const [row] = await db
    .select({ githubId: user.githubId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!row?.githubId) return null
  const parsed = Number(row.githubId)
  return Number.isFinite(parsed) ? parsed : null
}
