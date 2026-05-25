import { authedProcedure, publicProcedure } from "../init"
import { db } from "@tripwire/db/client"
import { eq } from "drizzle-orm"
import { user as userTable } from "@tripwire/db"
import type { TRPCRouterRecord } from "@trpc/server"

export const authRouter = {
  /**
   * Server-resolved user info — always reads role from the DB, so admin
   * promotions take effect without needing the user to sign out and back in.
   */
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null
    const [row] = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
        role: userTable.role,
        githubId: userTable.githubId,
      })
      .from(userTable)
      .where(eq(userTable.id, ctx.user.id))
      .limit(1)
    if (!row) return null
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      role: row.role ?? null,
      isAdmin: row.role === "admin",
      githubId: parseGithubId(row.githubId),
    }
  }),

  /** Authed-only mirror of `me` — throws if not logged in. */
  meStrict: authedProcedure.query(async ({ ctx }) => {
    const [row] = await db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        image: userTable.image,
        role: userTable.role,
        githubId: userTable.githubId,
      })
      .from(userTable)
      .where(eq(userTable.id, ctx.user.id))
      .limit(1)
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      image: row.image,
      role: row.role ?? null,
      isAdmin: row.role === "admin",
      githubId: parseGithubId(row.githubId),
    }
  }),
} satisfies TRPCRouterRecord

function parseGithubId(value: string | null | undefined): number | null {
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
