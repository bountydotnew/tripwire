import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"
import { EvlogError } from "evlog"
import { and, eq } from "drizzle-orm"
import { auth } from "@tripwire/auth"
import { db } from "@tripwire/db/client"
import { member } from "@tripwire/db"

// Repo/event/request/org ownership checks live in @tripwire/core so the
// tool registry can use them without importing tRPC. They throw EvlogError;
// the errorFormatter below surfaces it on shape.data for client consumers.
export {
  assertOrgOwner,
  assertRepoOwner,
  assertEventOwner,
  assertRequestOwner,
  assertRepoBelongsToOrg,
  assertEventBelongsToOrg,
  assertRequestBelongsToOrg,
} from "@tripwire/core"

export interface TRPCContext {
  headers: Headers
  user: { id: string; name: string; email: string; role?: string | null } | null
  /**
   * The Better Auth active organization id from `session.activeOrganizationId`.
   * Null when the user has no active org set, or when there's no session at
   * all. Procedures that require an active org should use `orgProcedure`,
   * which throws when this is null.
   */
  activeOrgId: string | null
}

export async function createContext(opts: {
  headers: Headers
}): Promise<TRPCContext> {
  // Validate session using Better Auth. The session row includes
  // `activeOrganizationId` (added by the better-auth `organization()`
  // plugin) — that's our single source of truth for "active org".
  const session = await auth.api.getSession({
    headers: opts.headers,
  })

  return {
    headers: opts.headers,
    user: session?.user ?? null,
    activeOrgId: session?.session?.activeOrganizationId ?? null,
  }
}

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // Surface evlog's structured fields on shape.data so clients can use
    // parseError() to branch on `code` and render `why` / `fix` / `link`.
    const cause = error.cause
    if (cause instanceof EvlogError) {
      return {
        ...shape,
        data: {
          ...shape.data,
          code: cause.code ?? shape.data?.code,
          status: cause.statusCode,
          why: cause.why,
          fix: cause.fix,
          link: cause.link,
        },
      }
    }
    return shape
  },
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

// Middleware that requires authentication
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export const authedProcedure = t.procedure.use(authMiddleware)

// Middleware that requires admin role
const adminMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    })
  }
  if (ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "This action requires admin privileges",
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  })
})

export const adminProcedure = t.procedure.use(adminMiddleware)

// Middleware that requires an active organization. Wraps authedProcedure's
// auth check with two more guarantees:
//   1. `ctx.activeOrgId` is non-null (the session has an active org set).
//   2. The user is still a member of that org (defense-in-depth against a
//      stale session pointing at an org the user was removed from).
const orgMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to perform this action",
    })
  }
  // Session row carries `activeOrganizationId` once Better Auth's
  // `setActive` has propagated. New sessions and users who haven't
  // switched orgs yet have it null — fall back to the user's first
  // org membership so tRPC calls work on first sign-in, before the
  // client's reconciliation effect lands. This is the same fallback
  // /api/chat.ts uses; both must agree or one will succeed while the
  // other returns UNAUTHORIZED for the same user-state.
  let activeOrgId = ctx.activeOrgId
  if (!activeOrgId) {
    const [firstMembership] = await db
      .select({ organizationId: member.organizationId })
      .from(member)
      .where(eq(member.userId, ctx.user.id))
      .limit(1)
    activeOrgId = firstMembership?.organizationId ?? null
  }
  if (!activeOrgId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "No active organization. Pick a workspace and try again.",
    })
  }
  const [membership] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(
        eq(member.userId, ctx.user.id),
        eq(member.organizationId, activeOrgId)
      )
    )
    .limit(1)
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You are not a member of the active organization.",
    })
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
      activeOrgId,
    },
  })
})

/**
 * Procedure that requires an authenticated user AND a valid active
 * organization. Use this for any data that is scoped to an org (chats,
 * rules, events, billing, etc.) — `ctx.activeOrgId` is guaranteed
 * non-null inside the resolver.
 */
export const orgProcedure = t.procedure.use(orgMiddleware)
