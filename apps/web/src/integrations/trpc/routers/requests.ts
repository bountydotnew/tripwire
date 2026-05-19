import { z } from "zod"
import { and, desc, eq } from "drizzle-orm"
import { authedProcedure, publicProcedure } from "../init"
import { assertRepoOwner, assertRequestOwner } from "@tripwire/core"
import { trpcError } from "../error"
import { db } from "@tripwire/db/client"
import {
  account,
  blacklistEntries,
  contributorRequests,
  repositories,
  whitelistEntries,
  type RequestKind,
} from "@tripwire/db"
import { logEvent } from "@tripwire/core"

import type { TRPCRouterRecord } from "@trpc/server"

const kindEnum = z.enum(["unblock", "access"])

async function resolveSessionGithubUser(userId: string): Promise<{
  id: number
  login: string
  avatar_url: string
}> {
  const [gh] = await db
    .select({ accessToken: account.accessToken, accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1)

  if (!gh?.accessToken) {
    throw trpcError({
      code: "auth.github_required",
      status: 401,
      message: "Sign in with GitHub to submit a request.",
      why: "No GitHub OAuth account is linked to this Tripwire session.",
      fix: "Sign in with the GitHub account you want this request filed under.",
    })
  }

  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${gh.accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "User-Agent": "Tripwire",
    },
  })

  if (!res.ok) {
    throw trpcError({
      code: "auth.github_verify_failed",
      status: 401,
      message: "Could not verify your GitHub identity.",
      why: "GitHub rejected the stored access token (likely expired or revoked).",
      fix: "Sign out of Tripwire and sign back in with GitHub to refresh the token.",
      internal: { githubStatus: res.status },
    })
  }

  return res.json()
}

export const requestsRouter = {
  whoami: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null
    try {
      const gh = await resolveSessionGithubUser(ctx.user.id)
      return { githubLogin: gh.login, avatarUrl: gh.avatar_url }
    } catch {
      return null
    }
  }),

  submit: publicProcedure
    .input(
      z.object({
        repoFullName: z.string().min(3),
        kind: kindEnum,
        reason: z.string().min(10).max(2000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!ctx.user) {
        throw trpcError({
          code: "auth.signin_required",
          status: 401,
          message: "Sign in to submit a request.",
          fix: 'Click "Sign in with GitHub" and try again.',
        })
      }

      const [repo] = await db
        .select()
        .from(repositories)
        .where(eq(repositories.fullName, input.repoFullName))
        .limit(1)
      if (!repo) {
        throw trpcError({
          code: "repo.not_found",
          status: 404,
          message: "Repository not found.",
          why: `No installed repository matches ${input.repoFullName}.`,
          fix: "Confirm the URL is correct, or ask the maintainer to install Tripwire on this repo.",
          internal: { repoFullName: input.repoFullName },
        })
      }

      const ghUser = await resolveSessionGithubUser(ctx.user.id)

      const [existing] = await db
        .select()
        .from(contributorRequests)
        .where(
          and(
            eq(contributorRequests.repoId, repo.id),
            eq(contributorRequests.githubUsername, ghUser.login),
            eq(contributorRequests.kind, input.kind),
            eq(contributorRequests.status, "pending")
          )
        )
        .limit(1)

      if (existing) {
        throw trpcError({
          code:
            input.kind === "unblock"
              ? "requests.pending_unblock_exists"
              : "requests.pending_access_exists",
          status: 409,
          message:
            input.kind === "unblock"
              ? "You already have a pending appeal for this repository."
              : "You already have a pending access request for this repository.",
          fix: "Wait for the maintainer to review your existing request, or contact them directly.",
        })
      }

      const [entry] = await db
        .insert(contributorRequests)
        .values({
          repoId: repo.id,
          kind: input.kind,
          githubUsername: ghUser.login,
          githubUserId: ghUser.id,
          avatarUrl: ghUser.avatar_url,
          reason: input.reason,
        })
        .returning()

      await logEvent({
        repoId: repo.id,
        action: "request_submitted",
        severity: "info",
        description: `@${ghUser.login} submitted a ${input.kind} request`,
        targetGithubUsername: ghUser.login,
        targetGithubUserId: ghUser.id,
        metadata: {
          requestId: entry.id,
          kind: input.kind,
          reason: input.reason,
        },
      })

      return { id: entry.id }
    }),

  list: authedProcedure
    .input(
      z.object({
        repoId: z.string().uuid(),
        status: z.enum(["pending", "approved", "denied"]).optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      await assertRepoOwner(ctx.user.id, input.repoId)
      const conds = [eq(contributorRequests.repoId, input.repoId)]
      if (input.status) conds.push(eq(contributorRequests.status, input.status))
      return db
        .select()
        .from(contributorRequests)
        .where(conds.length > 1 ? and(...conds) : conds[0])
        .orderBy(desc(contributorRequests.createdAt))
    }),

  decide: authedProcedure
    .input(
      z.object({
        requestId: z.string().uuid(),
        decision: z.enum(["approve", "deny"]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { request: req } = await assertRequestOwner(
        ctx.user.id,
        input.requestId
      )

      const nextStatus = input.decision === "approve" ? "approved" : "denied"

      // Atomic decision: a single transaction performs the CAS UPDATE on the
      // request row and (if approving) the whitelist/blacklist mutation, so
      // two concurrent decides can never both observe `pending` and both run
      // side effects. The CAS is the WHERE status = 'pending' guard plus the
      // 0-rows check below.
      await db.transaction(async (tx) => {
        const updated = await tx
          .update(contributorRequests)
          .set({
            status: nextStatus,
            decidedById: ctx.user.id,
            decidedAt: new Date(),
          })
          .where(
            and(
              eq(contributorRequests.id, req.id),
              eq(contributorRequests.status, "pending")
            )
          )
          .returning()

        if (updated.length === 0) {
          throw trpcError({
            code: "requests.already_decided",
            status: 409,
            message: `Request has already been ${req.status === "pending" ? "decided" : req.status}.`,
            why: `This request was ${req.status === "pending" ? "decided concurrently" : req.status} at ${req.decidedAt?.toISOString() ?? "an earlier time"}.`,
            fix: "Refresh the list — decisions can't be reversed from this view.",
          })
        }

        if (input.decision === "approve") {
          await applyApproval(tx, req.repoId, req.kind, {
            githubUsername: req.githubUsername,
            githubUserId: req.githubUserId,
            avatarUrl: req.avatarUrl,
            addedById: ctx.user.id,
          })
        }
      })

      // logEvent uses the global `db` handle (it doesn't accept a tx), so we
      // fire it after the transaction commits. If the tx threw, we never get
      // here and no spurious "decided" event is logged.
      await logEvent({
        repoId: req.repoId,
        action: "request_decided",
        severity: input.decision === "approve" ? "success" : "info",
        description: `@${req.githubUsername}'s ${req.kind} request was ${nextStatus}`,
        targetGithubUsername: req.githubUsername,
        targetGithubUserId: req.githubUserId ?? undefined,
        metadata: {
          requestId: req.id,
          decision: nextStatus,
          decidedBy: ctx.user.name ?? ctx.user.id,
        },
      })

      return { status: nextStatus }
    }),
} satisfies TRPCRouterRecord

type DbOrTx = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db

async function applyApproval(
  tx: DbOrTx,
  repoId: string,
  kind: RequestKind,
  gh: {
    githubUsername: string
    githubUserId: number | null
    avatarUrl: string | null
    addedById: string
  }
) {
  if (kind === "unblock") {
    await tx
      .delete(blacklistEntries)
      .where(
        and(
          eq(blacklistEntries.repoId, repoId),
          eq(blacklistEntries.githubUsername, gh.githubUsername)
        )
      )
    return
  }

  // Rely on the unique index (repoId, lower(githubUsername)) from PR 1 to
  // keep this idempotent under concurrent approvals.
  await tx
    .insert(whitelistEntries)
    .values({
      repoId,
      githubUsername: gh.githubUsername,
      githubUserId: gh.githubUserId ?? undefined,
      avatarUrl: gh.avatarUrl ?? undefined,
      addedById: gh.addedById,
    })
    .onConflictDoNothing({
      target: [whitelistEntries.repoId, whitelistEntries.githubUsername],
    })
}
