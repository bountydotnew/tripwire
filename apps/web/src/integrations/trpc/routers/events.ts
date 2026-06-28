import { z } from "zod"
import { eq, desc, sql, and, gte, inArray, isNotNull } from "drizzle-orm"
import { orgProcedure } from "../init"
import { assertEventBelongsToOrg, assertRepoBelongsToOrg } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import { events, workflowRuns, workflows } from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

const eventActionEnum = z.enum([
  "github_pr_opened",
  "github_pr_reopened",
  "github_pr_closed",
  "github_pr_merged",
  "github_pr_synchronized",
  "github_issue_opened",
  "github_issue_reopened",
  "github_issue_closed",
  "github_comment_created",
  "github_push",
  "github_release_published",
  "pr_closed",
  "issue_closed",
  "issue_deleted",
  "comment_deleted",
  "pipeline_allowed",
  "pipeline_blocked",
  "pipeline_warned",
  "pipeline_logged",
  "rule_near_miss",
  "whitelist_bypass",
  "bot_bypass",
  "blacklist_blocked",
  "rule_config_updated",
  "whitelist_added",
  "whitelist_removed",
  "blacklist_added",
  "blacklist_removed",
  "request_submitted",
  "request_decided",
  "user_blocked",
  "bot_blacklisted",
  "rule_triggered",
  "score_reset",
  "workflow_run",
])

const severityEnum = z.enum(["info", "warning", "success", "error"])

export const eventsRouter = {
  /** Get a single event by ID */
  get: orgProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const { event, repo } = await assertEventBelongsToOrg(
        input.eventId,
        ctx.activeOrgId
      )

      // Every event from the same pipeline run → the full checks timeline
      // (the outcome event carries metadata.evaluations; near-misses are
      // separate rows).
      const pipelineEvents = event.pipelineId
        ? await db
            .select()
            .from(events)
            .where(eq(events.pipelineId, event.pipelineId))
            .orderBy(events.createdAt)
        : []

      // Workflow runs for this PR/issue (number parsed from the "#42" ref).
      const number = event.githubRef
        ? Number.parseInt(event.githubRef.replace(/^#/, ""), 10)
        : Number.NaN
      const runs = Number.isNaN(number)
        ? []
        : await db
            .select({
              id: workflowRuns.id,
              workflowId: workflowRuns.workflowId,
              workflowName: workflows.name,
              status: workflowRuns.status,
              triggerKind: workflowRuns.triggerKind,
              result: workflowRuns.result,
              createdAt: workflowRuns.createdAt,
            })
            .from(workflowRuns)
            .leftJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
            .where(
              and(
                eq(workflowRuns.repoId, repo.id),
                eq(workflowRuns.pullNumber, number)
              )
            )
            .orderBy(desc(workflowRuns.createdAt))
            .limit(10)

      return {
        ...event,
        repo: {
          id: repo.id,
          name: repo.name,
          fullName: repo.fullName,
        },
        pipelineEvents,
        workflowRuns: runs,
      }
    }),

  /** Get digest events for the home page - recent flagged/blocked events grouped by user */
  digest: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(48).default(10),
        hours: z.number().int().min(1).max(168).default(24), // up to 7 days
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const since = new Date()
      since.setHours(since.getHours() - input.hours)

      // Fetch recent events that are flagged/blocked (not success/info)
      const rows = await db
        .select()
        .from(events)
        .where(
          and(
            eq(events.repoId, input.repoId),
            gte(events.createdAt, since),
            inArray(events.severity, ["warning", "error"]),
            isNotNull(events.targetGithubUsername)
          )
        )
        .orderBy(desc(events.createdAt))
        .limit(50) // Fetch more to group

      // Group events by targetGithubUsername + action type
      const grouped = new Map<
        string,
        {
          groupKey: string
          events: typeof rows
          latestAt: Date
          severity: string
        }
      >()

      for (const event of rows) {
        const username = event.targetGithubUsername || "unknown"
        const key = `${username}-${event.action}`

        if (!grouped.has(key)) {
          grouped.set(key, {
            groupKey: key,
            events: [],
            latestAt: event.createdAt,
            severity: event.severity || "warning",
          })
        }
        grouped.get(key)!.events.push(event)
      }

      // Convert to array and limit
      const digestGroups = Array.from(grouped.values())
        .sort((a, b) => b.latestAt.getTime() - a.latestAt.getTime())
        .slice(0, input.limit)
        .map((g) => ({
          groupKey: g.groupKey,
          severity: g.severity,
          eventCount: g.events.length,
          latestAt: g.latestAt,
          primaryEvent: g.events[0],
          users: [...new Set(g.events.map((e) => e.targetGithubUsername))],
        }))

      return {
        groups: digestGroups,
        totalEvents: rows.length,
      }
    }),

  /** List events with rich filtering */
  list: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
        /** Filter by event action(s) */
        actions: z.array(eventActionEnum).optional(),
        /** Filter by severity level(s) */
        severities: z.array(severityEnum).optional(),
        /** Filter by GitHub username */
        targetUsername: z.string().optional(),
        /** Filter by rule name */
        ruleName: z.string().optional(),
        /** Only events since this date */
        since: z.string().datetime().optional(),
        /**
         * Bot activity handling. "only" returns just bot-account events;
         * "exclude" hides them so the main feed isn't cluttered. A bot is any
         * actor whose GitHub login ends in `[bot]` or `bot` (same convention
         * as `activeUsers`).
         */
        botActivity: z.enum(["only", "exclude"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const conditions = [eq(events.repoId, input.repoId)]

      if (input.actions && input.actions.length > 0) {
        conditions.push(inArray(events.action, input.actions))
      }
      if (input.severities && input.severities.length > 0) {
        conditions.push(inArray(events.severity, input.severities))
      }
      if (input.targetUsername) {
        // GitHub usernames are case-insensitive; match on lower() so we don't
        // miss events stored with a different casing than the caller passed.
        conditions.push(
          sql`lower(${events.targetGithubUsername}) = ${input.targetUsername.toLowerCase()}`
        )
      }
      if (input.ruleName) {
        conditions.push(eq(events.ruleName, input.ruleName))
      }
      if (input.since) {
        conditions.push(gte(events.createdAt, new Date(input.since)))
      }
      if (input.botActivity === "only") {
        conditions.push(
          sql`(${events.targetGithubUsername} ILIKE '%[bot]' OR ${events.targetGithubUsername} ILIKE '%bot')`
        )
      } else if (input.botActivity === "exclude") {
        conditions.push(
          sql`(${events.targetGithubUsername} IS NULL OR (${events.targetGithubUsername} NOT ILIKE '%[bot]' AND ${events.targetGithubUsername} NOT ILIKE '%bot'))`
        )
      }

      const whereClause = and(...conditions)

      const [rows, countResult] = await Promise.all([
        db
          .select()
          .from(events)
          .where(whereClause)
          .orderBy(desc(events.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(events)
          .where(whereClause),
      ])

      return {
        events: rows,
        total: countResult[0]?.count ?? 0,
      }
    }),

  /** Aggregated stats for the Insights page (backward compatible) */
  stats: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const rows = await db
        .select({
          action: events.action,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(
            eq(events.repoId, input.repoId),
            gte(events.createdAt, thirtyDaysAgo)
          )
        )
        .groupBy(events.action)

      const counts: Record<string, number> = {}
      for (const row of rows) {
        counts[row.action] = row.count
      }

      return {
        prsClosed: counts["pr_closed"] ?? 0,
        issuesDeleted:
          (counts["issue_deleted"] ?? 0) + (counts["issue_closed"] ?? 0),
        commentsDeleted: counts["comment_deleted"] ?? 0,
        botsBlacklisted: counts["bot_blacklisted"] ?? 0,
        usersBanned: counts["user_blocked"] ?? 0,
        totalBlocked:
          (counts["pr_closed"] ?? 0) +
          (counts["issue_deleted"] ?? 0) +
          (counts["issue_closed"] ?? 0) +
          (counts["comment_deleted"] ?? 0),
        // New stats
        pipelineAllowed: counts["pipeline_allowed"] ?? 0,
        pipelineBlocked: counts["pipeline_blocked"] ?? 0,
        nearMisses: counts["rule_near_miss"] ?? 0,
        whitelistBypasses: counts["whitelist_bypass"] ?? 0,
        botBypasses: counts["bot_bypass"] ?? 0,
        blacklistBlocked: counts["blacklist_blocked"] ?? 0,
        workflowRuns: counts["workflow_run"] ?? 0,
      }
    }),

  /** Weekly/monthly event counts for trend charts (backward compatible) */
  trends: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        months: z.number().int().min(1).max(12).default(8),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const startDate = new Date()
      startDate.setMonth(startDate.getMonth() - input.months)

      const rows = await db
        .select({
          month: sql<string>`to_char(${events.createdAt}, 'Mon')`,
          monthNum: sql<number>`extract(month from ${events.createdAt})::int`,
          year: sql<number>`extract(year from ${events.createdAt})::int`,
          action: events.action,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(eq(events.repoId, input.repoId), gte(events.createdAt, startDate))
        )
        .groupBy(
          sql`to_char(${events.createdAt}, 'Mon')`,
          sql`extract(month from ${events.createdAt})`,
          sql`extract(year from ${events.createdAt})`,
          events.action
        )
        .orderBy(
          sql`extract(year from ${events.createdAt})`,
          sql`extract(month from ${events.createdAt})`
        )

      return rows
    }),

  /** Get event counts grouped by severity for the last N days */
  severityCounts: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const rows = await db
        .select({
          severity: events.severity,
          count: sql<number>`count(*)::int`,
        })
        .from(events)
        .where(
          and(eq(events.repoId, input.repoId), gte(events.createdAt, since))
        )
        .groupBy(events.severity)

      return rows.reduce(
        (acc, { severity, count }) => {
          if (severity) acc[severity] = count
          return acc
        },
        {} as Record<string, number>
      )
    }),

  /** Get the distinct GitHub usernames that have triggered events */
  activeUsers: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const rows = await db
        .select({
          username: events.targetGithubUsername,
          count: sql<number>`count(*)::int`,
          lastSeen: sql<string>`max(${events.createdAt})`,
        })
        .from(events)
        .where(
          and(eq(events.repoId, input.repoId), gte(events.createdAt, since))
        )
        .groupBy(events.targetGithubUsername)
        .orderBy(sql`count(*) desc`)
        .limit(50)

      return rows.filter(
        (r) =>
          r.username !== null &&
          !r.username.endsWith("[bot]") &&
          !r.username.endsWith("bot")
      )
    }),

  /** Get event counts grouped by action type for tab badges */
  countsByAction: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        days: z.number().int().min(1).max(90).default(30),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const since = new Date()
      since.setDate(since.getDate() - input.days)

      const botPattern = sql`(${events.targetGithubUsername} ILIKE '%[bot]' OR ${events.targetGithubUsername} ILIKE '%bot')`

      const [rows, botRows] = await Promise.all([
        db
          .select({
            action: events.action,
            count: sql<number>`count(*)::int`,
          })
          .from(events)
          .where(
            and(eq(events.repoId, input.repoId), gte(events.createdAt, since))
          )
          .groupBy(events.action),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(events)
          .where(
            and(
              eq(events.repoId, input.repoId),
              gte(events.createdAt, since),
              botPattern
            )
          ),
      ])

      const counts: Record<string, number> = {}
      let total = 0
      for (const row of rows) {
        counts[row.action] = row.count
        total += row.count
      }

      const botActivity = botRows[0]?.count ?? 0

      return {
        total,
        bot_activity: botActivity,
        pipeline_blocked: counts["pipeline_blocked"] ?? 0,
        pipeline_allowed: counts["pipeline_allowed"] ?? 0,
        rule_near_miss: counts["rule_near_miss"] ?? 0,
        rule_config_updated: counts["rule_config_updated"] ?? 0,
        blacklist_blocked: counts["blacklist_blocked"] ?? 0,
        whitelist_bypass: counts["whitelist_bypass"] ?? 0,
        bot_bypass: counts["bot_bypass"] ?? 0,
        workflow_run: counts["workflow_run"] ?? 0,
      }
    }),
} satisfies TRPCRouterRecord
