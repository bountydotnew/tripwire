import { z } from "zod"
import { and, desc, eq, sql } from "drizzle-orm"
import { orgProcedure } from "../init"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import { createFakeBounty } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import {
  fakeBountyConfigs,
  fakeBounties,
  fakeBountyCatches,
} from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

export const fakeBountiesRouter = {
  /** Get fake bounty config for a repo */
  getConfig: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const [config] = await db
        .select()
        .from(fakeBountyConfigs)
        .where(eq(fakeBountyConfigs.repoId, input.repoId))
        .limit(1)

      return config ?? null
    }),

  /** Update fake bounty config */
  updateConfig: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        enabled: z.boolean().optional(),
        intervalHours: z.number().int().min(0).max(168).optional(),
        maxActive: z.number().int().min(1).max(10).optional(),
        declineMessage: z.string().min(10).max(2000).optional(),
        issueLabels: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const { repoId, ...updates } = input
      const setFields: Record<string, unknown> = { updatedAt: new Date() }
      if (updates.enabled !== undefined) setFields.enabled = updates.enabled
      if (updates.intervalHours !== undefined)
        setFields.intervalHours = updates.intervalHours
      if (updates.maxActive !== undefined)
        setFields.maxActive = updates.maxActive
      if (updates.declineMessage !== undefined)
        setFields.declineMessage = updates.declineMessage
      if (updates.issueLabels !== undefined)
        setFields.issueLabels = updates.issueLabels

      const [existing] = await db
        .select()
        .from(fakeBountyConfigs)
        .where(eq(fakeBountyConfigs.repoId, repoId))
        .limit(1)

      if (existing) {
        await db
          .update(fakeBountyConfigs)
          .set(setFields)
          .where(eq(fakeBountyConfigs.repoId, repoId))
      } else {
        await db.insert(fakeBountyConfigs).values({
          repoId,
          ...setFields,
        })
      }

      return { ok: true }
    }),

  /** Manually create a fake bounty issue */
  create: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const result = await createFakeBounty(input.repoId)
      return result
    }),

  /** List fake bounties for a repo */
  list: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: z.enum(["active", "closed", "expired"]).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const conds = [eq(fakeBounties.repoId, input.repoId)]
      if (input.status) conds.push(eq(fakeBounties.status, input.status))
      return db
        .select()
        .from(fakeBounties)
        .where(conds.length > 1 ? and(...conds) : conds[0])
        .orderBy(desc(fakeBounties.createdAt))
    }),

  /** List catches for a repo */
  catches: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        limit: z.number().int().min(1).max(100).default(50),
      })
    )
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      return db
        .select()
        .from(fakeBountyCatches)
        .where(eq(fakeBountyCatches.repoId, input.repoId))
        .orderBy(desc(fakeBountyCatches.createdAt))
        .limit(input.limit)
    }),

  /** Get stats for fake bounty system */
  stats: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const [bountyCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fakeBounties)
        .where(eq(fakeBounties.repoId, input.repoId))

      const [activeCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fakeBounties)
        .where(
          and(
            eq(fakeBounties.repoId, input.repoId),
            eq(fakeBounties.status, "active")
          )
        )

      const [catchCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(fakeBountyCatches)
        .where(eq(fakeBountyCatches.repoId, input.repoId))

      const [uniqueClankers] = await db
        .select({
          count: sql<number>`count(distinct lower(${fakeBountyCatches.githubUsername}))::int`,
        })
        .from(fakeBountyCatches)
        .where(eq(fakeBountyCatches.repoId, input.repoId))

      return {
        totalBounties: bountyCount?.count ?? 0,
        activeBounties: activeCount?.count ?? 0,
        totalCatches: catchCount?.count ?? 0,
        uniqueClankers: uniqueClankers?.count ?? 0,
      }
    }),
} satisfies TRPCRouterRecord
