import { initTRPC, TRPCError } from '@trpc/server'
import superjson from 'superjson'
import { auth } from '#/lib/auth'

export interface TRPCContext {
  headers: Headers
  user: { id: string; name: string; email: string } | null
}

export async function createContext(opts: { headers: Headers }): Promise<TRPCContext> {
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
})

export const createTRPCRouter = t.router
export const publicProcedure = t.procedure

// Middleware that requires authentication
const authMiddleware = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: 'UNAUTHORIZED',
      message: 'You must be logged in to perform this action',
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
