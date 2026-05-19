import { z } from "zod"
import { TRPCError, type TRPCRouterRecord } from "@trpc/server"
import { and, eq, desc, sql } from "drizzle-orm"
import { authedProcedure, adminProcedure } from "../init"
import { db } from "@tripwire/db/client"
import {
  workflows,
  repositories,
  organizations,
  events,
  workflowRuns,
} from "@tripwire/db"
import { fetchPublicUser, fetchPublicRepos } from "@tripwire/github/public"
import {
  getInstallationToken,
  getUser,
  getMergedPrCount,
  getClosedPrCount,
  getPublicNonForkRepoCount,
  getPublicForkRepoCount,
  hasProfileReadme,
  fetchUserGraphQL,
  fetchUserAchievements,
  githubApi,
} from "@tripwire/github"
import { computeContributorScore } from "@tripwire/core"
import {
  fetchWorkflowRunContext,
  simulateWorkflowDefinition,
  workflowSupportsManualRun,
} from "#/lib/workflow-simulation"

function isPostgresUniqueViolation(err: unknown): boolean {
  let cur: unknown = err
  for (let i = 0; i < 5 && cur; i++) {
    const o = cur as { code?: string; cause?: unknown }
    if (o.code === "23505") return true
    cur = o.cause
  }
  return false
}

/** Verify user owns the repo (through the org chain) */
async function assertRepoAccess(userId: string, repoId: string) {
  const [repo] = await db
    .select()
    .from(repositories)
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(and(eq(repositories.id, repoId), eq(organizations.ownerId, userId)))
    .limit(1)
  if (!repo) throw new Error("Repo not found or access denied")
  return repo
}

const workflowDefinitionSchema = z.object({
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
})

const VALID_UNICODE_SCRIPTS = new Set([
  "Latn",
  "Cyrl",
  "Grek",
  "Arab",
  "Hebr",
  "Deva",
  "Beng",
  "Guru",
  "Gujr",
  "Orya",
  "Taml",
  "Telu",
  "Knda",
  "Mlym",
  "Sinh",
  "Thai",
  "Laoo",
  "Tibt",
  "Mymr",
  "Geor",
  "Hang",
  "Hani",
  "Kana",
  "Hira",
  "Bopo",
  "Ethi",
])

const VALID_ISO_CODES = new Set([
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "zh",
  "ja",
  "ko",
  "ru",
  "ar",
  "hi",
  "it",
  "nl",
  "pl",
  "sv",
  "da",
  "no",
  "fi",
  "cs",
  "tr",
  "th",
  "vi",
  "id",
  "ms",
  "uk",
  "ro",
  "hu",
  "el",
  "he",
  "bn",
  "ta",
  "te",
  "mr",
  "ur",
  "fa",
  "sw",
  "tl",
  "ca",
  "eu",
  "gl",
])

function isValidLanguageCode(code: string): boolean {
  if (VALID_ISO_CODES.has(code)) return true
  if (VALID_UNICODE_SCRIPTS.has(code)) return true
  if (/^[A-Z][a-z]{3}$/.test(code)) return true
  if (/^[a-z]{2,3}$/.test(code)) return true
  return false
}

function validateWorkflowDefinition(def: {
  nodes: unknown[]
  edges: unknown[]
}) {
  const nodes = def.nodes as Array<{
    type?: string
    data?: Record<string, unknown>
  }>

  const triggerCount = nodes.filter((n) => n.type === "trigger").length
  if (triggerCount > 1) {
    throw new Error("A workflow can only have one trigger")
  }

  for (const node of nodes) {
    if (node.type === "rule" && node.data?.rule === "language") {
      const lang = node.data?.language as string | undefined
      const langCode = node.data?.languageCode as string | undefined
      if (lang === "custom" && langCode) {
        if (!isValidLanguageCode(langCode)) {
          throw new Error(
            `Invalid language code: "${langCode}". Use an ISO 639-1 code (e.g. en, fr) or Unicode script name (e.g. Cyrl, Latn).`
          )
        }
      }
    }
  }
}

export const workflowsRouter = {
  list: authedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoAccess(ctx.user.id, input.repoId)
      return db
        .select()
        .from(workflows)
        .where(eq(workflows.repoId, input.repoId))
        .orderBy(desc(workflows.updatedAt))
    }),

  get: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [wf] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, input.id))
        .limit(1)
      if (!wf) throw new Error("Workflow not found")
      await assertRepoAccess(ctx.user.id, wf.repoId)
      return wf
    }),

  create: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        name: z.string().min(1).max(100),
        description: z.string().max(500).optional(),
        definition: workflowDefinitionSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRepoAccess(ctx.user.id, input.repoId)
      validateWorkflowDefinition(input.definition)

      const [wf] = await db
        .insert(workflows)
        .values({
          repoId: input.repoId,
          name: input.name,
          description: input.description,
          definition: input.definition,
        })
        .returning()
      return wf
    }),

  update: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullish(),
        definition: workflowDefinitionSchema.optional(),
        enabled: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, input.id))
        .limit(1)
      if (!existing) throw new Error("Workflow not found")
      await assertRepoAccess(ctx.user.id, existing.repoId)

      if (input.definition) {
        validateWorkflowDefinition(input.definition)
      }

      const [wf] = await db
        .update(workflows)
        .set({
          ...(input.name !== undefined && { name: input.name }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.definition !== undefined && {
            definition: input.definition,
          }),
          ...(input.enabled !== undefined && { enabled: input.enabled }),
          updatedAt: new Date(),
        })
        .where(eq(workflows.id, input.id))
        .returning()
      return wf
    }),

  delete: authedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, input.id))
        .limit(1)
      if (!existing) throw new Error("Workflow not found")
      await assertRepoAccess(ctx.user.id, existing.repoId)
      await db.delete(workflows).where(eq(workflows.id, input.id))
      return { ok: true }
    }),

  /** Fetch real GitHub user data for workflow simulation */
  simulate: authedProcedure
    .input(
      z.object({
        username: z.string().min(1),
        repoId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const username = input.username

      // Try to get an installation token for richer data
      let token: string | null = null
      let repoId: string | null = input.repoId ?? null
      if (repoId) {
        try {
          const [repo] = await db
            .select({ orgId: repositories.orgId })
            .from(repositories)
            .where(eq(repositories.id, repoId))
            .limit(1)
          if (repo) {
            const [org] = await db
              .select({ installationId: organizations.githubInstallationId })
              .from(organizations)
              .where(eq(organizations.id, repo.orgId))
              .limit(1)
            if (org) token = await getInstallationToken(org.installationId)
          }
        } catch {
          /* fall back to public API */
        }
      }

      // Fetch data — authenticated if possible, public fallback
      if (token) {
        const [
          ghUser,
          mergedPrs,
          closedPrs,
          publicNonForkRepos,
          publicForkRepos,
          profileReadme,
          graphqlData,
          achievements,
          repoEvents,
        ] = await Promise.all([
          getUser(token, username).catch(() => null),
          getMergedPrCount(token, username).catch(() => 0),
          getClosedPrCount(token, username).catch(() => 0),
          getPublicNonForkRepoCount(token, username).catch(() => 0),
          getPublicForkRepoCount(token, username).catch(() => 0),
          hasProfileReadme(token, username).catch(() => false),
          fetchUserGraphQL(token, username).catch(() => null),
          fetchUserAchievements(username).catch(() => []),
          repoId
            ? db
                .select()
                .from(events)
                .where(
                  and(
                    eq(events.repoId, repoId),
                    sql`lower(${events.targetGithubUsername}) = ${username.toLowerCase()}`
                  )
                )
            : Promise.resolve([]),
        ])

        if (!ghUser) return { found: false as const }

        const createdAt = new Date(
          (ghUser as Record<string, unknown>).created_at as string
        )
        const accountAgeDays = Math.floor(
          (Date.now() - createdAt.getTime()) / 86_400_000
        )
        const closedUnmergedPrs = Math.max(0, closedPrs - mergedPrs)
        const blockedCount = repoEvents.filter(
          (e) => e.action === "pipeline_blocked"
        ).length
        const allowedCount = repoEvents.filter(
          (e) => e.action === "pipeline_allowed"
        ).length
        const nearMissCount = repoEvents.filter(
          (e) => e.action === "rule_near_miss"
        ).length

        const score = computeContributorScore({
          accountAgeDays,
          followers:
            ((ghUser as Record<string, unknown>).followers as number) ?? 0,
          following:
            ((ghUser as Record<string, unknown>).following as number) ?? 0,
          publicRepos:
            ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
          publicNonForkRepoCount: publicNonForkRepos,
          publicForkRepoCount: publicForkRepos,
          contextRepoPrCount: 0,
          publicGists:
            ((ghUser as Record<string, unknown>).public_gists as number) ?? 0,
          bio: ((ghUser as Record<string, unknown>).bio as string) ?? null,
          company:
            ((ghUser as Record<string, unknown>).company as string) ?? null,
          location:
            ((ghUser as Record<string, unknown>).location as string) ?? null,
          blog: ((ghUser as Record<string, unknown>).blog as string) ?? null,
          twitterUsername:
            ((ghUser as Record<string, unknown>).twitter_username as string) ??
            null,
          hasTwoFactor:
            ((ghUser as Record<string, unknown>)
              .two_factor_authentication as boolean) ?? false,
          hasProfileReadme: profileReadme,
          graphql: graphqlData,
          achievements,
          mergedPrCount: mergedPrs,
          closedPrCount: closedPrs,
          closedUnmergedPrCount: closedUnmergedPrs,
          blockedCount,
          allowedCount,
          nearMissCount,
        })

        return {
          found: true as const,
          user: {
            login: (ghUser as Record<string, unknown>).login as string,
            avatarUrl: (ghUser as Record<string, unknown>).avatar_url as string,
            name: (ghUser as Record<string, unknown>).name as string | null,
            bio: (ghUser as Record<string, unknown>).bio as string | null,
            createdAt: (ghUser as Record<string, unknown>).created_at as string,
          },
          data: {
            accountAgeDays,
            followers:
              ((ghUser as Record<string, unknown>).followers as number) ?? 0,
            following:
              ((ghUser as Record<string, unknown>).following as number) ?? 0,
            publicRepos:
              ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
            publicNonForkRepos: publicNonForkRepos,
            publicGists:
              ((ghUser as Record<string, unknown>).public_gists as number) ?? 0,
            hasProfileReadme: profileReadme,
            mergedPrs,
            score: score.total,
          },
        }
      }

      // Public API fallback (no token)
      const [user, repos] = await Promise.all([
        fetchPublicUser(username),
        fetchPublicRepos(username),
      ])

      if (!user) return { found: false as const }

      const accountAgeDays = Math.floor(
        (Date.now() - new Date(user.created_at).getTime()) / 86_400_000
      )
      const nonForkRepos = repos.filter((r) => !r.fork)

      const score = computeContributorScore({
        accountAgeDays,
        followers: user.followers,
        following: user.following,
        publicRepos: user.public_repos,
        publicNonForkRepoCount: nonForkRepos.length,
        publicForkRepoCount: repos.length - nonForkRepos.length,
        contextRepoPrCount: 0,
        publicGists: user.public_gists,
        bio: user.bio,
        company: user.company,
        location: user.location,
        blog: user.blog,
        twitterUsername: user.twitter_username,
        hasTwoFactor: false,
        hasProfileReadme: false,
        graphql: null,
        achievements: [],
        mergedPrCount: 0,
        closedPrCount: 0,
        closedUnmergedPrCount: 0,
        blockedCount: 0,
        allowedCount: 0,
        nearMissCount: 0,
      })

      return {
        found: true as const,
        user: {
          login: user.login,
          avatarUrl: user.avatar_url,
          name: user.name,
          bio: user.bio,
          createdAt: user.created_at,
        },
        data: {
          accountAgeDays,
          followers: user.followers,
          following: user.following,
          publicRepos: user.public_repos,
          publicNonForkRepos: nonForkRepos.length,
          publicGists: user.public_gists,
          hasProfileReadme: false,
          mergedPrs: 0,
          score: score.total,
        },
      }
    }),

  /** Run a user, PR, issue, or comment through all active workflows — returns per-workflow pass/fail */
  runReport: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        username: z.string().min(1),
        /** Optional: PR/issue number to check (fetches content text for content-based rules) */
        ref: z.string().optional(),
        /** What kind of content to check: user (default), pr, issue, comment */
        kind: z.enum(["user", "pr", "issue"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRepoAccess(ctx.user.id, input.repoId)

      const activeWorkflows = await db
        .select()
        .from(workflows)
        .where(
          and(eq(workflows.repoId, input.repoId), eq(workflows.enabled, true))
        )
        .orderBy(desc(workflows.updatedAt))

      if (activeWorkflows.length === 0) {
        return {
          username: input.username,
          results: [],
          userData: null,
          message: "No active workflows",
        }
      }

      const { userData, contentText, contentMeta } =
        await fetchWorkflowRunContext({
          repoId: input.repoId,
          username: input.username,
          ref: input.ref,
          kind: input.kind,
        })

      const results = activeWorkflows.map((wf) =>
        simulateWorkflowDefinition(wf, userData)
      )

      return {
        username: input.username,
        kind: input.kind ?? "user",
        results,
        userData,
        contentMeta,
        contentText,
      }
    }),

  /** Workflow IDs in this repo that currently have a queued or running manual (or other) run */
  listInflightManualRuns: authedProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoAccess(ctx.user.id, input.repoId)
      const rows = await db
        .select({ workflowId: workflowRuns.workflowId })
        .from(workflowRuns)
        .where(
          and(
            eq(workflowRuns.repoId, input.repoId),
            sql`${workflowRuns.status} IN ('queued', 'running')`
          )
        )
      return {
        inflightWorkflowIds: [...new Set(rows.map((r) => r.workflowId))],
      }
    }),

  /** Start a manual workflow run with server-side in-flight dedupe per (workflow, repo, optional PR). */
  manualRun: authedProcedure
    .input(
      z.object({
        workflowId: z.string().uuid(),
        username: z.string().min(1),
        ref: z.string().optional(),
        kind: z.enum(["user", "pr", "issue"]).optional(),
        /** Dedupe scope: omit for repo-wide (-1); otherwise a GitHub PR number */
        pullNumber: z.number().int().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const [row] = await db
        .select()
        .from(workflows)
        .where(eq(workflows.id, input.workflowId))
        .limit(1)
      if (!row)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Workflow not found",
        })
      await assertRepoAccess(ctx.user.id, row.repoId)

      if (!row.enabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow is disabled",
        })
      }
      if (!workflowSupportsManualRun(row)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Workflow has no manual trigger",
        })
      }

      let pullNum = input.pullNumber ?? -1
      if (pullNum < -1) pullNum = -1
      if (
        input.kind === "pr" &&
        input.ref !== undefined &&
        input.pullNumber === undefined
      ) {
        const n = Number.parseInt(input.ref.replace("#", ""), 10)
        if (!Number.isNaN(n)) pullNum = n
      }

      const now = new Date()
      let runId: string
      try {
        const [inserted] = await db
          .insert(workflowRuns)
          .values({
            workflowId: row.id,
            repoId: row.repoId,
            pullNumber: pullNum,
            status: "running",
            triggerKind: "manual",
            requestedByUserId: ctx.user.id,
            targetUsername: input.username,
            startedAt: now,
          })
          .returning({ id: workflowRuns.id })
        if (!inserted) throw new Error("Failed to create workflow run")
        runId = inserted.id
      } catch (e) {
        if (isPostgresUniqueViolation(e)) {
          throw new TRPCError({
            code: "CONFLICT",
            message:
              "A run is already in progress for this workflow and scope.",
          })
        }
        throw e
      }

      try {
        const { userData, contentText, contentMeta } =
          await fetchWorkflowRunContext({
            repoId: row.repoId,
            username: input.username,
            ref: input.ref,
            kind: input.kind,
          })
        const sim = simulateWorkflowDefinition(row, userData)
        await db
          .update(workflowRuns)
          .set({
            status: "completed",
            completedAt: new Date(),
            result: { simulation: sim, userData, contentMeta, contentText },
          })
          .where(eq(workflowRuns.id, runId))

        return {
          runId,
          status: "completed" as const,
          simulation: sim,
          userData,
          contentMeta,
          contentText,
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        await db
          .update(workflowRuns)
          .set({
            status: "failed",
            completedAt: new Date(),
            error: msg,
          })
          .where(eq(workflowRuns.id, runId))
        throw err
      }
    }),

  // ─── Admin endpoints (internal data collection) ────────────

  /** Scan an entire repo's contributors — admin only, no repo ownership check */
  adminScanRepo: adminProcedure
    .input(
      z.object({
        /** owner/repo format */
        repo: z.string().min(1),
        /** GitHub installation ID to use for auth */
        installationId: z.number().int(),
        /** How many contributors to scan (default 30) */
        limit: z.number().int().min(1).max(500).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const token = await getInstallationToken(input.installationId)
      const limit = input.limit ?? 30

      // Fetch recent PRs to find unique contributors
      const searchResult = await githubApi(
        `/search/issues?q=repo:${encodeURIComponent(input.repo)}+type:pr+is:merged&sort=created&order=desc&per_page=${Math.min(limit * 2, 100)}`,
        token
      )
      const rawItems =
        (searchResult?.items as Array<Record<string, unknown>>) ?? []

      // Dedupe by author
      const seen = new Set<string>()
      const contributors: Array<{
        login: string
        avatar: string
        prCount: number
      }> = []
      for (const item of rawItems) {
        const user = (item.user as Record<string, unknown>) ?? {}
        const login = (user.login as string) ?? ""
        if (!login || seen.has(login.toLowerCase())) continue
        seen.add(login.toLowerCase())
        contributors.push({
          login,
          avatar: (user.avatar_url as string) ?? "",
          prCount: 1,
        })
        if (contributors.length >= limit) break
      }

      // Count PRs per contributor
      for (const item of rawItems) {
        const login =
          ((item.user as Record<string, unknown>)?.login as string) ?? ""
        const c = contributors.find(
          (x) => x.login.toLowerCase() === login.toLowerCase()
        )
        if (c && c.prCount === 1) {
          // already counted first one above, just increment
        } else if (c) {
          c.prCount++
        }
      }

      return {
        repo: input.repo,
        totalPrsScanned: rawItems.length,
        contributors,
      }
    }),

  /** Scan a batch of PRs from any repo — admin only */
  adminScanPRs: adminProcedure
    .input(
      z.object({
        repo: z.string().min(1),
        installationId: z.number().int(),
        /** PR state to scan */
        state: z.enum(["merged", "closed", "open", "all"]).optional(),
        limit: z.number().int().min(1).max(100).optional(),
      })
    )
    .mutation(async ({ input }) => {
      const token = await getInstallationToken(input.installationId)
      const limit = input.limit ?? 25
      const state = input.state ?? "merged"
      const stateFilter = state === "all" ? "" : `+is:${state}`

      const searchResult = await githubApi(
        `/search/issues?q=repo:${encodeURIComponent(input.repo)}+type:pr${stateFilter}&sort=created&order=desc&per_page=${limit}`,
        token
      )

      const rawItems =
        (searchResult?.items as Array<Record<string, unknown>>) ?? []

      const prs = rawItems.map((item) => {
        const user = (item.user as Record<string, unknown>) ?? {}
        const pr = (item.pull_request as Record<string, unknown>) ?? {}
        return {
          number: (item.number as number) ?? 0,
          title: (item.title as string) ?? "",
          author: (user.login as string) ?? "",
          authorAvatar: (user.avatar_url as string) ?? "",
          state: (pr.merged_at as string)
            ? "merged"
            : ((item.state as string) ?? "open"),
          createdAt: (item.created_at as string) ?? "",
          mergedAt: (pr.merged_at as string) ?? null,
          closedAt: (item.closed_at as string) ?? null,
          url: (item.html_url as string) ?? "",
        }
      })

      return {
        repo: input.repo,
        totalCount: (searchResult?.total_count as number) ?? 0,
        prs,
      }
    }),

  /** Bulk score multiple users — admin only, for research/analysis */
  adminBulkScore: adminProcedure
    .input(
      z.object({
        usernames: z.array(z.string().min(1)).min(1).max(50),
        installationId: z.number().int(),
      })
    )
    .mutation(async ({ input }) => {
      const token = await getInstallationToken(input.installationId)

      const results = []
      for (const username of input.usernames) {
        try {
          const [ghUser, mergedPrs, publicNonForkRepos, profileReadme] =
            await Promise.all([
              getUser(token, username).catch(() => null),
              getMergedPrCount(token, username).catch(() => 0),
              getPublicNonForkRepoCount(token, username).catch(() => 0),
              hasProfileReadme(token, username).catch(() => false),
            ])

          if (!ghUser) {
            results.push({ username, found: false as const })
            continue
          }

          const createdAt = new Date(
            (ghUser as Record<string, unknown>).created_at as string
          )
          const accountAgeDays = Math.floor(
            (Date.now() - createdAt.getTime()) / 86_400_000
          )

          const score = computeContributorScore({
            accountAgeDays,
            followers:
              ((ghUser as Record<string, unknown>).followers as number) ?? 0,
            following:
              ((ghUser as Record<string, unknown>).following as number) ?? 0,
            publicRepos:
              ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
            publicNonForkRepoCount: publicNonForkRepos,
            publicForkRepoCount: 0,
            contextRepoPrCount: 0,
            publicGists:
              ((ghUser as Record<string, unknown>).public_gists as number) ?? 0,
            bio: ((ghUser as Record<string, unknown>).bio as string) ?? null,
            company:
              ((ghUser as Record<string, unknown>).company as string) ?? null,
            location:
              ((ghUser as Record<string, unknown>).location as string) ?? null,
            blog: ((ghUser as Record<string, unknown>).blog as string) ?? null,
            twitterUsername:
              ((ghUser as Record<string, unknown>)
                .twitter_username as string) ?? null,
            hasTwoFactor: false,
            hasProfileReadme: profileReadme,
            graphql: null,
            achievements: [],
            mergedPrCount: mergedPrs,
            closedPrCount: 0,
            closedUnmergedPrCount: 0,
            blockedCount: 0,
            allowedCount: 0,
            nearMissCount: 0,
          })

          results.push({
            username,
            found: true as const,
            score: score.total,
            accountAgeDays,
            mergedPrs,
            publicRepos:
              ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
            followers:
              ((ghUser as Record<string, unknown>).followers as number) ?? 0,
          })
        } catch {
          results.push({ username, found: false as const })
        }
      }

      return { results }
    }),
} satisfies TRPCRouterRecord
