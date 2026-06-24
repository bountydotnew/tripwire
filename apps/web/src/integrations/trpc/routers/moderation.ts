import { z } from "zod"
import { and, desc, eq, inArray, lte, or, sql } from "drizzle-orm"
import { orgProcedure } from "../init"
import {
  assertRepoBelongsToOrg,
  logEvent,
  QUEUEABLE_ACTIONS,
} from "@tripwire/core"
import { db } from "@tripwire/db/client"
import {
  moderationItems,
  whitelistEntries,
  blacklistEntries,
  watchlistEntries,
  events,
} from "@tripwire/db"
import { trpcError } from "../error"
import { getEventActionLabel } from "#/lib/event-labels"

import type { TRPCRouterRecord } from "@trpc/server"

const resolveActionEnum = z.enum([
  "allow",
  "dismiss",
  "snooze",
  "whitelist",
  "blacklist",
  "watch",
])

// High severity floats to the top; recency breaks ties.
const severityRank = sql`case ${moderationItems.severity} when 'error' then 3 when 'warning' then 2 when 'success' then 1 else 0 end`

/** Items that should appear in the open queue (open, or a snooze that elapsed). */
function openCondition(repoId: string) {
  return and(
    eq(moderationItems.repoId, repoId),
    or(
      eq(moderationItems.status, "open"),
      and(
        eq(moderationItems.status, "snoozed"),
        lte(moderationItems.snoozedUntil, new Date())
      )
    )
  )
}

export const moderationRouter = {
  /** Open review-queue items, severity-first then newest. */
  listQueue: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const items = await db
        .select()
        .from(moderationItems)
        .where(openCondition(input.repoId))
        .orderBy(desc(severityRank), desc(moderationItems.createdAt))
        .limit(input.limit)
        .offset(input.offset)
      return { items }
    }),

  /** Count of open items — drives the sidebar badge. */
  pendingCount: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(moderationItems)
        .where(openCondition(input.repoId))
      return { count: row?.count ?? 0 }
    }),

  /**
   * Act on a queue item. DB-effecting actions only in this slice
   * (allow/dismiss/snooze + whitelist/blacklist/watch the target user).
   * Content actions that hit GitHub (delete/warn/hide) land in the next slice.
   */
  resolveItem: orgProcedure
    .input(
      z.object({
        itemId: z.string().uuid(),
        action: resolveActionEnum,
        snoozeMinutes: z.number().int().min(5).max(60 * 24 * 30).default(1440),
        note: z.string().max(500).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [item] = await db
        .select()
        .from(moderationItems)
        .where(eq(moderationItems.id, input.itemId))
        .limit(1)
      if (!item) {
        throw trpcError({
          code: "moderation.item_not_found",
          status: 404,
          message: "Queue item not found",
        })
      }
      await assertRepoBelongsToOrg(item.repoId, ctx.activeOrgId)

      const username = item.targetGithubUsername
      const userId = item.targetGithubUserId

      if (input.action === "whitelist" || input.action === "blacklist") {
        if (!username) {
          throw trpcError({
            code: "moderation.no_target_user",
            status: 400,
            message: "This item has no target user to act on",
          })
        }
        const table =
          input.action === "whitelist" ? whitelistEntries : blacklistEntries
        const opposite =
          input.action === "whitelist" ? blacklistEntries : whitelistEntries
        // Lists are mutually exclusive — drop the user from the other list.
        await db
          .delete(opposite)
          .where(
            and(
              eq(opposite.repoId, item.repoId),
              sql`lower(${opposite.githubUsername}) = ${username.toLowerCase()}`
            )
          )
        await db
          .insert(table)
          .values({
            repoId: item.repoId,
            githubUsername: username,
            githubUserId: userId,
            addedById: ctx.user.id,
          })
          .onConflictDoNothing()
        await logEvent({
          repoId: item.repoId,
          action:
            input.action === "whitelist" ? "whitelist_added" : "blacklist_added",
          severity: "info",
          description: `@${username} ${input.action === "whitelist" ? "added to whitelist" : "blacklisted"} from review queue`,
          targetGithubUsername: username,
          targetGithubUserId: userId ?? undefined,
        })
      } else if (input.action === "watch") {
        if (!username) {
          throw trpcError({
            code: "moderation.no_target_user",
            status: 400,
            message: "This item has no target user to watch",
          })
        }
        await db
          .insert(watchlistEntries)
          .values({
            repoId: item.repoId,
            githubUsername: username,
            githubUserId: userId,
            note: input.note,
            addedById: ctx.user.id,
          })
          .onConflictDoNothing()
      }

      const status =
        input.action === "snooze"
          ? "snoozed"
          : input.action === "dismiss"
            ? "dismissed"
            : "resolved"

      await db
        .update(moderationItems)
        .set({
          status,
          resolution: input.action,
          resolvedById: ctx.user.id,
          resolvedAt: new Date(),
          snoozedUntil:
            input.action === "snooze"
              ? new Date(Date.now() + input.snoozeMinutes * 60_000)
              : null,
          updatedAt: new Date(),
        })
        .where(eq(moderationItems.id, item.id))

      return { ok: true as const, status }
    }),

  /**
   * One-time seed: derive open queue items from recent flagged events that
   * don't already have an item. Lets the queue show real data before the
   * live creation hooks (next slice) are wired in.
   */
  backfill: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(200).default(50),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const existing = await db
        .select({
          eventId: moderationItems.eventId,
          githubRef: moderationItems.githubRef,
          status: moderationItems.status,
        })
        .from(moderationItems)
        .where(eq(moderationItems.repoId, input.repoId))
      const seenEventIds = new Set(
        existing.map((e) => e.eventId).filter((id): id is string => !!id)
      )
      // Skip content that already has an open item so a second flagged event
      // for the same PR/issue (e.g. the duplicate warn audit) doesn't pile up.
      const seenRefs = new Set(
        existing
          .filter((e) => e.status === "open" && e.githubRef)
          .map((e) => e.githubRef as string)
      )

      const flagged = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.repoId, input.repoId),
            inArray(events.action, [...QUEUEABLE_ACTIONS])
          )
        )
        .orderBy(desc(events.createdAt))
        .limit(input.limit)

      const rows = flagged
        .filter((e) => {
          if (seenEventIds.has(e.id)) return false
          if (e.githubRef && seenRefs.has(e.githubRef)) return false
          if (e.githubRef) seenRefs.add(e.githubRef)
          return true
        })
        .map((e) => ({
          repoId: input.repoId,
          source: "rule_flag" as const,
          subject: e.contentType ? ("content" as const) : ("user" as const),
          status: "open" as const,
          severity: e.severity ?? "warning",
          title:
            e.description?.split("\n")[0]?.slice(0, 140) ||
            getEventActionLabel(e.action),
          detail: e.description,
          contentType: e.contentType,
          githubRef: e.githubRef,
          ruleName: e.ruleName,
          targetGithubUsername: e.targetGithubUsername,
          targetGithubUserId: e.targetGithubUserId,
          eventId: e.id,
        }))

      if (rows.length > 0) {
        await db.insert(moderationItems).values(rows)
      }
      return { inserted: rows.length }
    }),
} satisfies TRPCRouterRecord
