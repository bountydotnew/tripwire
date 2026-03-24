import { Ratelimit } from "@unkey/ratelimit";
import { env } from "#/env";
import { TRPCError } from "@trpc/server";

// ---------------------------------------------------------------------------
// Namespace configs
// ---------------------------------------------------------------------------

const NAMESPACES = {
	/** Joining the waitlist */
	waitlist: { limit: 3, duration: "60s" as const },
} as const;

export type RatelimitNamespace = keyof typeof NAMESPACES;

// ---------------------------------------------------------------------------
// Limiter cache
// ---------------------------------------------------------------------------

const limiterCache = new Map<string, Ratelimit>();

function getLimiter(namespace: RatelimitNamespace): Ratelimit | null {
	if (!env.UNKEY_ROOT_KEY) return null;

	const cached = limiterCache.get(namespace);
	if (cached) return cached;

	const config = NAMESPACES[namespace];
	const limiter = new Ratelimit({
		rootKey: env.UNKEY_ROOT_KEY,
		namespace,
		limit: config.limit,
		duration: config.duration,
	});

	limiterCache.set(namespace, limiter);
	return limiter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given namespace and identifier.
 *
 * Returns `{ success: true, remaining }` if allowed.
 * Throws `TRPCError` with code `TOO_MANY_REQUESTS` if denied.
 * If Unkey is not configured (no `UNKEY_ROOT_KEY`), silently allows all requests.
 */
export async function checkRateLimit(
	namespace: RatelimitNamespace,
	identifier: string,
): Promise<{ success: true; remaining: number }> {
	const limiter = getLimiter(namespace);

	// If Unkey is not configured, allow all (development fallback)
	if (!limiter) {
		return { success: true, remaining: -1 };
	}

	try {
		const result = await limiter.limit(identifier);

		if (!result.success) {
			throw new TRPCError({
				code: "TOO_MANY_REQUESTS",
				message: "Slow down! Too many requests.",
			});
		}

		return { success: true, remaining: result.remaining };
	} catch (err) {
		// Re-throw rate limit errors, but silently allow on infrastructure failures
		if (err instanceof TRPCError) throw err;
		return { success: true, remaining: -1 };
	}
}
