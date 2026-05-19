import { z } from "zod"
import { and, desc, eq, isNull } from "drizzle-orm"
import { authedProcedure } from "../init"
import { assertOrgOwner } from "@tripwire/core"
import { generateApiKey } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import { apiKeys } from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

export const apiKeysRouter = {
  /** List active API keys for an org (never returns the hash) */
  list: authedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertOrgOwner(ctx.user.id, input.orgId)
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
        .where(and(eq(apiKeys.orgId, input.orgId), isNull(apiKeys.revokedAt)))
        .orderBy(desc(apiKeys.createdAt))
    }),

  /** Create a new API key. Returns the raw key ONCE. */
  create: authedProcedure
    .input(
      z.object({
        orgId: z.string().uuid(),
        name: z.string().min(1).max(100),
        scopes: z.string().default("vouches:read"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await assertOrgOwner(ctx.user.id, input.orgId)

      const { raw, hash, prefix } = generateApiKey()

      const [entry] = await db
        .insert(apiKeys)
        .values({
          orgId: input.orgId,
          name: input.name,
          keyHash: hash,
          keyPrefix: prefix,
          scopes: input.scopes,
          createdById: ctx.user.id,
        })
        .returning({ id: apiKeys.id })

      return { id: entry.id, key: raw, prefix }
    }),

  /** Revoke an API key */
  revoke: authedProcedure
    .input(z.object({ keyId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      // Look up the key to find its org, then verify ownership
      const [key] = await db
        .select({ orgId: apiKeys.orgId })
        .from(apiKeys)
        .where(eq(apiKeys.id, input.keyId))
        .limit(1)

      if (!key) return { ok: false }
      await assertOrgOwner(ctx.user.id, key.orgId)

      await db
        .update(apiKeys)
        .set({ revokedAt: new Date() })
        .where(eq(apiKeys.id, input.keyId))

      return { ok: true }
    }),
} satisfies TRPCRouterRecord
