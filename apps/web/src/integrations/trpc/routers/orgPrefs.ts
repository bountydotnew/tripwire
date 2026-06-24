import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import type { TRPCRouterRecord } from "@trpc/server"
import { db } from "@tripwire/db/client"
import {
  member,
  orgPrCommentPreferences,
  DEFAULT_PR_COMMENT_PREFERENCES,
} from "@tripwire/db"
import { orgProcedure } from "../init"

const TONE = z.enum(["formal", "neutral", "casual"])
const ROUTE_MODE = z.enum(["comment", "check", "both", "silent"])
const EMAIL_DIGEST = z.enum(["off", "daily", "weekly"])

const urlOrNull = z
  .union([z.string().url(), z.literal(""), z.null()])
  .transform((v) => (v ? v : null))

const updateInput = z.object({
  showReason: z.boolean().optional(),
  showRuleName: z.boolean().optional(),
  showAppealLink: z.boolean().optional(),
  showWarningDisclaimer: z.boolean().optional(),
  botDisplayName: z.string().trim().min(1).max(80).optional(),
  tone: TONE.optional(),
  customFooterText: z.string().max(500).nullable().optional(),
  routeMode: ROUTE_MODE.optional(),
  slackWebhookUrl: urlOrNull.optional(),
  discordWebhookUrl: urlOrNull.optional(),
  emailDigest: EMAIL_DIGEST.optional(),
})

async function assertOrgEditor(userId: string, orgId: string) {
  const [m] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, orgId)))
    .limit(1)
  if (!m || (m.role !== "owner" && m.role !== "admin")) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only org owners and admins can edit PR comment preferences.",
    })
  }
}

export const orgPrefsRouter = {
  get: orgProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select()
      .from(orgPrCommentPreferences)
      .where(
        eq(orgPrCommentPreferences.betterAuthOrgId, ctx.activeOrgId)
      )
      .limit(1)

    if (row) return row

    // No row yet — return defaults bound to this org so the form has data
    // to render without forcing the merchant to "create" prefs first.
    return {
      betterAuthOrgId: ctx.activeOrgId,
      ...DEFAULT_PR_COMMENT_PREFERENCES,
      createdAt: new Date(),
      updatedAt: new Date(),
    }
  }),

  canEdit: orgProcedure.query(async ({ ctx }) => {
    const [m] = await db
      .select({ role: member.role })
      .from(member)
      .where(
        and(
          eq(member.userId, ctx.user.id),
          eq(member.organizationId, ctx.activeOrgId)
        )
      )
      .limit(1)
    return m?.role === "owner" || m?.role === "admin"
  }),

  update: orgProcedure
    .input(updateInput)
    .mutation(async ({ ctx, input }) => {
      await assertOrgEditor(ctx.user.id, ctx.activeOrgId)

      const [row] = await db
        .insert(orgPrCommentPreferences)
        .values({
          betterAuthOrgId: ctx.activeOrgId,
          ...input,
        })
        .onConflictDoUpdate({
          target: orgPrCommentPreferences.betterAuthOrgId,
          set: { ...input, updatedAt: new Date() },
        })
        .returning()

      return row
    }),
} satisfies TRPCRouterRecord
