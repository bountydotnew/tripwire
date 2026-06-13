import { z } from "zod"
import { and, eq, desc, sql } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { orgProcedure } from "../init"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import { customRules, events } from "@tripwire/db"
import {
  logEvent,
  getCustomRuleLimits,
  countDefinitionNodes,
  definitionReferencesEnrichment,
  evaluateCustomRule,
  resolveSignals,
} from "@tripwire/core"
import {
  createCustomRuleSchema,
  updateCustomRuleSchema,
  customRuleDefinitionSchema,
} from "@tripwire/core"
import { getOrgPlanId } from "#/lib/billing"
import {
  peekCachedUserGraphql,
  peekCachedUserProfile,
} from "@tripwire/github/data-factory"

import type { TRPCRouterRecord } from "@trpc/server"
import type { CustomRuleDefinition } from "@tripwire/db"

export const customRulesRouter = {
  list: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const rows = await db
        .select()
        .from(customRules)
        .where(eq(customRules.repoId, input.repoId))
        .orderBy(desc(customRules.updatedAt))

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        enabled: row.enabled,
        action: row.action,
        thresholdCount: row.thresholdCount,
        scopeOverride: row.scopeOverride,
        priority: row.priority,
        simulatedAt: row.simulatedAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        nodeCount: countDefinitionNodes(row.definition),
      }))
    }),

  get: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [rule] = await db
        .select({
          id: customRules.id,
          repoId: customRules.repoId,
          name: customRules.name,
          description: customRules.description,
          definition: customRules.definition,
          action: customRules.action,
          thresholdCount: customRules.thresholdCount,
          scopeOverride: customRules.scopeOverride,
        })
        .from(customRules)
        .where(eq(customRules.id, input.id))
        .limit(1)

      if (!rule) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Custom rule not found",
        })
      }

      await assertRepoBelongsToOrg(rule.repoId, ctx.activeOrgId)
      return rule
    }),

  create: orgProcedure
    .input(createCustomRuleSchema)
    .mutation(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const planId = await getOrgPlanId(ctx.activeOrgId)
      const limits = getCustomRuleLimits(planId)

      const existingCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(customRules)
        .where(eq(customRules.repoId, input.repoId))

      const currentCount = existingCount[0]?.count ?? 0
      if (currentCount >= limits.maxRules) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You've reached the limit of ${limits.maxRules} custom rules on your ${planId} plan. Upgrade to add more.`,
        })
      }

      if (
        !limits.canUseEnrichmentSignals &&
        definitionReferencesEnrichment(input.definition)
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Enrichment signals (profile README, sponsors, badges, etc.) require a Pro plan.",
        })
      }

      const [created] = await db
        .insert(customRules)
        .values({
          repoId: input.repoId,
          name: input.name,
          description: input.description,
          definition: input.definition,
          action: input.action,
          thresholdCount: input.thresholdCount,
          scopeOverride: input.scopeOverride,
          priority: input.priority,
        })
        .returning()

      await logEvent({
        repoId: input.repoId,
        action: "rule_config_updated",
        severity: "info",
        description: `Custom rule "${input.name}" created`,
        metadata: {
          customRuleId: created.id,
          customRuleName: input.name,
          updatedBy: ctx.user.name ?? ctx.user.id,
        },
      })

      return created
    }),

  update: orgProcedure
    .input(updateCustomRuleSchema)
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(customRules)
        .where(eq(customRules.id, input.id))
        .limit(1)

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Custom rule not found",
        })
      }

      await assertRepoBelongsToOrg(existing.repoId, ctx.activeOrgId)

      const definitionChanged = input.definition !== undefined

      const updateData: Record<string, unknown> = { updatedAt: new Date() }
      if (input.name !== undefined) updateData.name = input.name
      if (input.description !== undefined)
        updateData.description = input.description
      if (input.definition !== undefined)
        updateData.definition = input.definition
      if (input.action !== undefined) updateData.action = input.action
      if (input.thresholdCount !== undefined)
        updateData.thresholdCount = input.thresholdCount
      if (input.scopeOverride !== undefined)
        updateData.scopeOverride = input.scopeOverride
      if (input.priority !== undefined) updateData.priority = input.priority

      if (definitionChanged) {
        updateData.simulatedAt = null
        updateData.enabled = false
      }

      const [updated] = await db
        .update(customRules)
        .set(updateData)
        .where(eq(customRules.id, input.id))
        .returning()

      await logEvent({
        repoId: existing.repoId,
        action: "rule_config_updated",
        severity: "info",
        description: `Custom rule "${updated.name}" updated${definitionChanged ? " (definition changed, simulation required)" : ""}`,
        metadata: {
          customRuleId: updated.id,
          customRuleName: updated.name,
          definitionChanged,
          updatedBy: ctx.user.name ?? ctx.user.id,
        },
      })

      return updated
    }),

  delete: orgProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(customRules)
        .where(eq(customRules.id, input.id))
        .limit(1)

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Custom rule not found",
        })
      }

      await assertRepoBelongsToOrg(existing.repoId, ctx.activeOrgId)

      await db.delete(customRules).where(eq(customRules.id, input.id))

      await logEvent({
        repoId: existing.repoId,
        action: "rule_config_updated",
        severity: "info",
        description: `Custom rule "${existing.name}" deleted`,
        metadata: {
          customRuleId: existing.id,
          customRuleName: existing.name,
          updatedBy: ctx.user.name ?? ctx.user.id,
        },
      })

      return { ok: true as const }
    }),

  enable: orgProcedure
    .input(z.object({ id: z.string().uuid(), enabled: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select()
        .from(customRules)
        .where(eq(customRules.id, input.id))
        .limit(1)

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Custom rule not found",
        })
      }

      await assertRepoBelongsToOrg(existing.repoId, ctx.activeOrgId)

      if (input.enabled && !existing.simulatedAt) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Run simulation before enabling this rule",
        })
      }

      const [updated] = await db
        .update(customRules)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(customRules.id, input.id))
        .returning()

      await logEvent({
        repoId: existing.repoId,
        action: "rule_config_updated",
        severity: "info",
        description: `Custom rule "${existing.name}" ${input.enabled ? "enabled" : "disabled"}`,
        metadata: {
          customRuleId: existing.id,
          customRuleName: existing.name,
          enabled: input.enabled,
          updatedBy: ctx.user.name ?? ctx.user.id,
        },
      })

      return updated
    }),

  simulate: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        definition: customRuleDefinitionSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const recentEvents = await db
        .select({
          username: events.targetGithubUsername,
        })
        .from(events)
        .where(
          and(
            eq(events.repoId, input.repoId),
            sql`${events.targetGithubUsername} IS NOT NULL`
          )
        )
        .orderBy(desc(events.createdAt))
        .limit(100)

      const seen = new Set<string>()
      const uniqueUsernames: string[] = []
      for (const row of recentEvents) {
        if (!row.username) continue
        const lower = row.username.toLowerCase()
        if (seen.has(lower)) continue
        seen.add(lower)
        uniqueUsernames.push(row.username)
        if (uniqueUsernames.length >= 50) break
      }

      if (uniqueUsernames.length === 0) {
        return {
          totalContributors: 0,
          wouldBlock: 0,
          wouldPass: 0,
          wouldNearMiss: 0,
          blockPercentage: 0,
          contributors: [],
        }
      }

      const contributors: Array<{
        username: string
        avatarUrl: string | null
        passed: boolean
        nearMiss: boolean
        detail: string
      }> = []

      let wouldBlock = 0
      let wouldPass = 0
      let wouldNearMiss = 0

      for (const username of uniqueUsernames) {
        const [profileSlot, graphql] = await Promise.all([
          peekCachedUserProfile(username),
          peekCachedUserGraphql(username),
        ])
        const profile = profileSlot?.profile ?? null
        const githubUserId = profileSlot?.githubUserId ?? 0
        const avatarUrl = profile
          ? (((profile as Record<string, unknown>).avatar_url as
              | string
              | null) ?? null)
          : null

        const signals = resolveSignals(
          { senderLogin: username, senderId: githubUserId },
          profile,
          undefined,
          null,
          graphql ? { graphql } : undefined
        )

        const result = evaluateCustomRule(
          input.definition as CustomRuleDefinition,
          signals
        )

        const detailParts = result.evaluations.map((e) => e.detail)

        if (!result.passed) {
          wouldBlock++
        } else if (result.nearMiss) {
          wouldNearMiss++
          wouldPass++
        } else {
          wouldPass++
        }

        contributors.push({
          username,
          avatarUrl,
          passed: result.passed,
          nearMiss: result.nearMiss,
          detail: detailParts.join("; "),
        })
      }

      const totalContributors = contributors.length
      const blockPercentage =
        totalContributors > 0
          ? Math.round((wouldBlock / totalContributors) * 100)
          : 0

      return {
        totalContributors,
        wouldBlock,
        wouldPass,
        wouldNearMiss,
        blockPercentage,
        contributors,
      }
    }),

  limits: orgProcedure.query(async ({ ctx }) => {
    const planId = await getOrgPlanId(ctx.activeOrgId)
    const limits = getCustomRuleLimits(planId)
    return { ...limits, planId }
  }),
} satisfies TRPCRouterRecord
