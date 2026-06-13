import { z } from "zod"
import { and, desc, eq, isNull } from "drizzle-orm"
import { authedProcedure } from "../init"
import { generateApiKey } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import { apiKeys } from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

/**
 * API keys are user-owned: every procedure here scopes by `ctx.user.id`
 * and never accepts an org id. Cross-org data access made via a key is
 * gated at each public endpoint by the caller's active org / explicit
 * org id parameter — not by the key itself.
 */
export const apiKeysRouter = {
  /** List active API keys for the signed-in user (never returns the hash). */
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(and(eq(apiKeys.userId, ctx.user.id), isNull(apiKeys.revokedAt)))
      .orderBy(desc(apiKeys.createdAt))
  }),

  /** Create a new API key. Returns the raw key ONCE. */
  create: authedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        scopes: z.string().default("vouches:read"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { raw, hash, prefix } = generateApiKey()

      const [entry] = await db
        .insert(apiKeys)
        .values({
          userId: ctx.user.id,
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          scopes: input.scopes,
        })
        .returning({ id: apiKeys.id })

      return { id: entry.id, key: raw, prefix }
    }),

  /** Revoke an API key the signed-in user owns. */
  revoke: authedProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const result = await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(
          and(eq(apiKeys.id, input.keyId), eq(apiKeys.userId, ctx.user.id))
        )
        .returning({ id: apiKeys.id })

      return { ok: result.length > 0 }
    }),
} satisfies TRPCRouterRecord
