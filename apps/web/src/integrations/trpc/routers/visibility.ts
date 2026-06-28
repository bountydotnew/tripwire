import { z } from "zod"
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm"
import { orgProcedure } from "../init"
import { assertRepoBelongsToOrg, logEvent } from "@tripwire/core"
import { trpcError } from "../error"
import { db } from "@tripwire/db/client"
import {
  githubReputation,
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
  blacklistJoinClause,
  excludeBots,
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

/** A queued/running sync older than this is treated as stale — the worker
 * died, timed out, or (in dev) no Inngest server consumed the event. Lets the
 * UI stop spinning and the user re-trigger. Real syncs take 1–5 min. */
const STALE_SYNC_MS = 15 * 60 * 1000

export const visibilityRouter = {
  listContributors: orgProcedure
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
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

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

  bulkAction: orgProcedure
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
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

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

  suggestedWhitelist: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        scoreThreshold: z.number().int().min(0).max(100).default(75),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
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
            excludeMaintainerSelf(myGithubUserId),
            excludeBots
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

  riskAlerts: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(50).default(10),
        scoreThreshold: z.number().int().min(0).max(100).default(40),
        sinceDays: z.number().int().min(1).max(90).default(14),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
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
            excludeMaintainerSelf(myGithubUserId),
            excludeBots
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

  syncStatus: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
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
      const stale =
        !!latest &&
        (latest.status === "queued" || latest.status === "running") &&
        Date.now() - new Date(latest.startedAt ?? latest.createdAt).getTime() >
          STALE_SYNC_MS
      return { lastRun: latest ?? null, stale }
    }),

  requestSync: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      // Ignore stale runs so a crashed / never-consumed sync can't lock the
      // user out of re-triggering.
      const [active] = await db
        .select({ id: visibilitySyncRuns.id })
        .from(visibilitySyncRuns)
        .where(
          and(
            eq(visibilitySyncRuns.repoId, input.repoId),
            inArray(visibilitySyncRuns.status, ["queued", "running"]),
            gte(
              visibilitySyncRuns.createdAt,
              new Date(Date.now() - STALE_SYNC_MS)
            )
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
} satisfies TRPCRouterRecord

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
