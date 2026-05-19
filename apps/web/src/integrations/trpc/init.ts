import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"
import { EvlogError } from "evlog"
import { auth } from "@tripwire/auth"

// Repo/event/request/org ownership checks live in @tripwire/core so the
// tool registry can use them without importing tRPC. They throw EvlogError;
// the errorFormatter below surfaces it on shape.data for client consumers.
export {
  assertOrgOwner,
  assertRepoOwner,
  assertEventOwner,
  assertRequestOwner,
} from "@tripwire/core"

export interface TRPCContext {
  headers: Headers
  user: { id: string; name: string; email: string; role?: string | null } | null
}

export async function createContext(opts: {
  headers: Headers
}): Promise<TRPCContext> {
  // Validate session using Better Auth
  const session = await auth.api.getSession({
    headers: opts.headers,
  })

  return {
    headers: opts.headers,
    user: session?.user ?? null,
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
