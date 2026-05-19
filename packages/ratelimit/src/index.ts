import { Ratelimit } from "@unkey/ratelimit"
import { env } from "@tripwire/env/server"
import { createError, EvlogError } from "evlog"

const RATE_LIMITED = (message: string) =>
  createError({
    code: "ratelimit.exceeded",
    status: 429,
    message,
  })

if (env.NODE_ENV === "production" && !env.UNKEY_ROOT_KEY) {
  throw new Error("UNKEY_ROOT_KEY is required in production")
}

const NAMESPACES = {
  /** Joining the waitlist */
  waitlist: { limit: 3, duration: "60s" as const },
} as const

export type RatelimitNamespace = keyof typeof NAMESPACES

const limiterCache = new Map<string, Ratelimit>()

function getLimiter(namespace: RatelimitNamespace): Ratelimit | null {
  if (!env.UNKEY_ROOT_KEY) return null

  const cached = limiterCache.get(namespace)
  if (cached) return cached

  const config = NAMESPACES[namespace]
  const limiter = new Ratelimit({
    rootKey: env.UNKEY_ROOT_KEY,
    namespace,
    limit: config.limit,
    duration: config.duration,
  })

  limiterCache.set(namespace, limiter)
  return limiter
}

export async function checkRateLimit(
  namespace: RatelimitNamespace,
  identifier: string
): Promise<{ success: true; remaining: number }> {
  const limiter = getLimiter(namespace)

  if (!limiter) {
    return { success: true, remaining: -1 }
  }

  try {
    const result = await limiter.limit(identifier)

    if (!result.success) {
      throw RATE_LIMITED("Slow down! Too many requests.")
    }

    return { success: true, remaining: result.remaining }
  } catch (err) {
    if (err instanceof EvlogError && err.code === "ratelimit.exceeded")
      throw err
    if (env.NODE_ENV === "production") {
      throw RATE_LIMITED("Rate limit unavailable — try again shortly.")
    }
    return { success: true, remaining: -1 }
  }
}
