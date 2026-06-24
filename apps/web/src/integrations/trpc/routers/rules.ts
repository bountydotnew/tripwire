import { z } from "zod"
import { eq } from "drizzle-orm"
import { orgProcedure } from "../init"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import {
  ruleConfigs,
  whitelistEntries,
  blacklistEntries,
  DEFAULT_RULE_CONFIG,
} from "@tripwire/db"
import { logEvent } from "@tripwire/core"
import { describeRuleConfigChanges, normalizeRuleConfig } from "@tripwire/core"
import { ruleConfigSchema } from "@tripwire/core"

import type { TRPCRouterRecord } from "@trpc/server"

export const rulesRouter = {
  /** Get rule config for a repo */
  getConfig: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const [config] = await db
        .select()
        .from(ruleConfigs)
        .where(eq(ruleConfigs.repoId, input.repoId))
      return config?.config ?? DEFAULT_RULE_CONFIG
    }),

  /** Update rule config for a repo (upsert) */
  updateConfig: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        config: ruleConfigSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      const [existing] = await db
        .select()
        .from(ruleConfigs)
        .where(eq(ruleConfigs.repoId, input.repoId))

      const previousConfig = normalizeRuleConfig(
        existing?.config ?? DEFAULT_RULE_CONFIG
      )
      const nextConfig = normalizeRuleConfig(input.config)

      if (existing) {
        await db
          .update(ruleConfigs)
          .set({ config: nextConfig, updatedAt: new Date() })
          .where(eq(ruleConfigs.repoId, input.repoId))
      } else {
        await db.insert(ruleConfigs).values({
          repoId: input.repoId,
          config: nextConfig,
        })
      }

      const changes = describeRuleConfigChanges(previousConfig, nextConfig)

      await logEvent({
        repoId: input.repoId,
        action: "rule_config_updated",
        severity: "info",
        description:
          changes.length > 0
            ? `Rules updated: ${changes.join(", ")}`
            : "Rule configuration updated",
        metadata: {
          updatedBy: ctx.user?.name ?? ctx.user?.id,
          changes,
          newConfig: nextConfig,
        },
      })

      return nextConfig
    }),

  /** Count enabled rules for a repo */
  countEnabled: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const [configRow] = await db
        .select()
        .from(ruleConfigs)
        .where(eq(ruleConfigs.repoId, input.repoId))

      const config = configRow?.config ?? DEFAULT_RULE_CONFIG
      let enabledCount = 0

      for (const value of Object.values(config)) {
        if (typeof value === "object" && value !== null && "enabled" in value) {
          if ((value as { enabled: boolean }).enabled) {
            enabledCount++
          }
        }
      }

      return { enabled: enabledCount, total: Object.keys(config).length }
    }),

  /** Export config as JSON (for copy-to-another-repo) */
  exportConfig: orgProcedure
    .input(z.object({ repoId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)
      const [config] = await db
        .select()
        .from(ruleConfigs)
        .where(eq(ruleConfigs.repoId, input.repoId))

      const whitelist = await db
        .select()
        .from(whitelistEntries)
        .where(eq(whitelistEntries.repoId, input.repoId))

      const blacklist = await db
        .select()
        .from(blacklistEntries)
        .where(eq(blacklistEntries.repoId, input.repoId))

      return {
        rules: config?.config ?? DEFAULT_RULE_CONFIG,
        whitelist: whitelist.map((w) => w.githubUsername),
        blacklist: blacklist.map((b) => b.githubUsername),
      }
    }),

  /** Import config from JSON */
  importConfig: orgProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        config: ruleConfigSchema,
        whitelist: z.array(z.string()).optional(),
        blacklist: z.array(z.string()).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await assertRepoBelongsToOrg(input.repoId, ctx.activeOrgId)

      // Persist rule config + whitelist + blacklist atomically. If the lists
      // fail to insert we don't want the rule config drifting from them.
      //
      // TODO: conflict-resolution policy between whitelist and blacklist on
      // import. Today we accept the imported data as-is — if a username
      // shows up on both lists in the source repo, both rows land here.
      // The unique-per-list indexes still prevent duplicates within a list.
      await db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(ruleConfigs)
          .where(eq(ruleConfigs.repoId, input.repoId))

        if (existing) {
          await tx
            .update(ruleConfigs)
            .set({ config: input.config, updatedAt: new Date() })
            .where(eq(ruleConfigs.repoId, input.repoId))
        } else {
          await tx.insert(ruleConfigs).values({
            repoId: input.repoId,
            config: input.config,
          })
        }

        if (input.whitelist && input.whitelist.length > 0) {
          await tx
            .insert(whitelistEntries)
            .values(
              input.whitelist.map((githubUsername) => ({
                repoId: input.repoId,
                githubUsername,
                addedById: ctx.user.id,
              }))
            )
            .onConflictDoNothing()
        }

        if (input.blacklist && input.blacklist.length > 0) {
          await tx
            .insert(blacklistEntries)
            .values(
              input.blacklist.map((githubUsername) => ({
                repoId: input.repoId,
                githubUsername,
                addedById: ctx.user.id,
              }))
            )
            .onConflictDoNothing()
        }
      })

      return { success: true }
    }),
} satisfies TRPCRouterRecord
