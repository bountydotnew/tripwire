import { z } from "zod"
import { eq } from "drizzle-orm"
import { authedProcedure } from "../init"
import { db } from "@tripwire/db/client"
import { userPreferences } from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

export const preferencesRouter = {
  get: authedProcedure.query(async ({ ctx }) => {
    const [pref] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, ctx.user.id))
      .limit(1)
    return pref ?? null
  }),

  update: authedProcedure
    .input(
      z.object({
        activeOrgId: z.string().nullish(),
        activeRepoId: z.string().nullish(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await db
        .insert(userPreferences)
        .values({
          userId: ctx.user.id,
          activeOrgId: input.activeOrgId ?? null,
          activeRepoId: input.activeRepoId ?? null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userPreferences.userId,
          set: {
            ...(input.activeOrgId !== undefined && {
              activeOrgId: input.activeOrgId ?? null,
            }),
            ...(input.activeRepoId !== undefined && {
              activeRepoId: input.activeRepoId ?? null,
            }),
            updatedAt: new Date(),
          },
        })
      return { ok: true }
    }),
} satisfies TRPCRouterRecord
