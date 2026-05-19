import { z } from "zod"
import { and, eq } from "drizzle-orm"
import { TRPCError } from "@trpc/server"
import { authedProcedure } from "../init"
import { assertOrgOwner } from "@tripwire/core"
import { db } from "@tripwire/db/client"
import { organizations, repositories, member } from "@tripwire/db"

import type { TRPCRouterRecord } from "@trpc/server"

/** Verify user is a member of a Better Auth org, return the membership */
async function assertBaOrgMember(userId: string, baOrgId: string) {
  const [m] = await db
    .select()
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.organizationId, baOrgId)))
    .limit(1)
  if (!m) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of this organization",
    })
  }
  return m
}

export const orgsRouter = {
  /** List all Tripwire orgs (GitHub installations) for a user */
  list: authedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, ctx.user.id))
  }),

  /** Get a single org by ID */
  get: authedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      return assertOrgOwner(ctx.user.id, input.orgId)
    }),

  /** List repos for a GitHub installation */
  repos: authedProcedure
    .input(z.object({ orgId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      await assertOrgOwner(ctx.user.id, input.orgId)
      return db
        .select()
        .from(repositories)
        .where(eq(repositories.orgId, input.orgId))
    }),

  /** List all repos across all orgs for a user (legacy, backwards compat) */
  myRepos: authedProcedure.query(async ({ ctx }) => {
    const orgs = await db
      .select()
      .from(organizations)
      .where(eq(organizations.ownerId, ctx.user.id))

    if (orgs.length === 0) return []

    const allRepos = []
    for (const org of orgs) {
      const repos = await db
        .select()
        .from(repositories)
        .where(eq(repositories.orgId, org.id))
      allRepos.push(
        ...repos.map((r) => ({
          ...r,
          orgName: org.githubAccountLogin,
          installationId: org.githubInstallationId,
        }))
      )
    }
    return allRepos
  }),

  /** List repos scoped to a Better Auth org (for the workspace switcher) */
  reposByBaOrg: authedProcedure
    .input(z.object({ baOrgId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBaOrgMember(ctx.user.id, input.baOrgId)

      const ghInstalls = await db
        .select()
        .from(organizations)
        .where(eq(organizations.betterAuthOrgId, input.baOrgId))

      if (ghInstalls.length === 0) return []

      const allRepos = []
      for (const install of ghInstalls) {
        const repos = await db
          .select()
          .from(repositories)
          .where(eq(repositories.orgId, install.id))
        allRepos.push(
          ...repos.map((r) => ({
            ...r,
            orgName: install.githubAccountLogin,
            installationId: install.githubInstallationId,
          }))
        )
      }
      return allRepos
    }),

  /** List GitHub installations linked to a Better Auth org */
  installationsByBaOrg: authedProcedure
    .input(z.object({ baOrgId: z.string() }))
    .query(async ({ ctx, input }) => {
      await assertBaOrgMember(ctx.user.id, input.baOrgId)
      return db
        .select()
        .from(organizations)
        .where(eq(organizations.betterAuthOrgId, input.baOrgId))
    }),

  /** Reassign a GitHub installation to a different BA org (owner only) */
  linkInstallation: authedProcedure
    .input(
      z.object({
        installationId: z.string().uuid(),
        baOrgId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Verify user owns the installation
      await assertOrgOwner(ctx.user.id, input.installationId)
      // Verify user is a member of the target BA org
      await assertBaOrgMember(ctx.user.id, input.baOrgId)

      await db
        .update(organizations)
        .set({ betterAuthOrgId: input.baOrgId, updatedAt: new Date() })
        .where(eq(organizations.id, input.installationId))

      return { ok: true }
    }),
} satisfies TRPCRouterRecord
