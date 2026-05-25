/**
 * Read-through HTTP cache for GitHub API responses. Wraps a fetcher
 * with: stable cache keys, request-scoped in-flight dedup, conditional
 * refresh via ETag/If-Modified-Since, signal-based stale invalidation,
 * adaptive freshness when GitHub budget is low, and stale-if-rate-limited
 * fallback. Ported from diffkit's github-cache.ts. v1 omits KV split-mode
 * + local-first; those land in later phases.
 */

export type GitHubConditionalHeaders = {
  etag?: string | null
  lastModified?: string | null
}

export type GitHubResponseMetadata = {
  etag: string | null
  lastModified: string | null
  rateLimitRemaining: number | null
  rateLimitReset: number | null
  statusCode: number
}

export type GitHubCacheStoreEntry = {
  cacheKey: string
  scope: string
  resource: string
  paramsJson: string
  etag: string | null
  lastModified: string | null
  payloadJson: string
  fetchedAt: number
  freshUntil: number
  rateLimitRemaining: number | null
  rateLimitReset: number | null
  statusCode: number
}

export type GitHubCacheStore = {
  get(cacheKey: string): Promise<GitHubCacheStoreEntry | null>
  upsert(entry: GitHubCacheStoreEntry): Promise<void>
  delete(cacheKey: string): Promise<void>
}

export type GitHubFetchResult<TData> =
  | { kind: "not-modified"; metadata: GitHubResponseMetadata }
  | { kind: "success"; data: TData; metadata: GitHubResponseMetadata }

export type GitHubLocalFirstMeta = {
  /** "fresh" = served from a still-valid cache entry. "stale" = served stale, background revalidate kicked off. "miss" = no cache, fetched live. */
  cacheStatus: "fresh" | "stale" | "miss"
  fetchedAt: number | null
  isRevalidating: boolean
}

type GetOrRevalidateGitHubResourceOptions<TData> = {
  scope: string
  resource: string
  params?: unknown
  freshForMs: number
  signalKeys?: string[]
  fetcher: (
    conditionals: GitHubConditionalHeaders,
  ) => Promise<GitHubFetchResult<TData>>
  store?: GitHubCacheStore
  inFlightCache?: Map<string, Promise<unknown>>
  getLatestSignalUpdatedAt?: (signalKeys: string[]) => Promise<number | null>
  merge?: (existing: TData, fresh: TData) => TData
  now?: () => number
}

const GITHUB_RATE_LIMIT_LOW_REMAINING = 100
const GITHUB_RATE_LIMIT_CRITICAL_REMAINING = 25
const GITHUB_RATE_LIMIT_LOW_FRESH_FLOOR_MS = 2 * 60 * 1000
const GITHUB_RATE_LIMIT_CRITICAL_FRESH_FLOOR_MS = 5 * 60 * 1000
const GITHUB_RATE_LIMIT_RESET_BUFFER_MS = 5 * 1000
const GITHUB_STALE_IF_RATE_LIMITED_FALLBACK_MS = 60 * 1000
const GITHUB_STALE_IF_FORBIDDEN_MS = 30 * 1000

const requestScopedInFlightGitHubCacheReads = new WeakMap<
  Request,
  Map<string, Promise<unknown>>
>()

async function getRequestScopedInFlightCache() {
  try {
    // @ts-expect-error - @tanstack/react-start is only available in the
    // apps/web runtime; the try/catch fails soft when not present.
    const { getRequest } = await import("@tanstack/react-start/server")
    const request = getRequest() as Request
    let inFlightCache = requestScopedInFlightGitHubCacheReads.get(request)
    if (!inFlightCache) {
      inFlightCache = new Map<string, Promise<unknown>>()
      requestScopedInFlightGitHubCacheReads.set(request, inFlightCache)
    }
    return inFlightCache
  } catch {
    return null
  }
}

function normalizeJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonValue(item))
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === "bigint") {
    return value.toString()
  }
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        const normalized = normalizeJsonValue(
          (value as Record<string, unknown>)[key],
        )
        if (typeof normalized !== "undefined") {
          acc[key] = normalized
        }
        return acc
      }, {})
  }
  return value
}

/** Recursively sorts keys + normalizes Date/BigInt so equivalent inputs share a cache key. */
function stableSerialize(value: unknown) {
  return JSON.stringify(normalizeJsonValue(value ?? null))
}

function buildGitHubCacheKey({
  scope,
  resource,
  paramsJson,
}: {
  scope: string
  resource: string
  paramsJson: string
}) {
  return `${scope}::${resource}::${paramsJson}`
}

function parseCachedPayload<TData>(payloadJson: string) {
  return JSON.parse(payloadJson) as TData
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function parseNullableInt(value: string | null | undefined) {
  if (!value) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function getRateLimitResetMs(rateLimitReset: number | null | undefined) {
  if (typeof rateLimitReset !== "number" || !Number.isFinite(rateLimitReset)) {
    return null
  }
  return rateLimitReset * 1_000
}

/** Extend freshness when GitHub budget is low so we stop hammering the API as we approach the wall. */
function getAdaptiveFreshForMs(
  currentTime: number,
  baseFreshForMs: number,
  metadata: Pick<
    GitHubResponseMetadata,
    "rateLimitRemaining" | "rateLimitReset"
  >,
) {
  if (
    typeof metadata.rateLimitRemaining !== "number" ||
    !Number.isFinite(metadata.rateLimitRemaining)
  ) {
    return baseFreshForMs
  }

  if (metadata.rateLimitRemaining <= GITHUB_RATE_LIMIT_CRITICAL_REMAINING) {
    const untilReset = getRateLimitResetMs(metadata.rateLimitReset)
    const resetExtendedFreshForMs =
      typeof untilReset === "number"
        ? Math.max(
            untilReset - currentTime + GITHUB_RATE_LIMIT_RESET_BUFFER_MS,
            0,
          )
        : 0

    return Math.max(
      baseFreshForMs,
      GITHUB_RATE_LIMIT_CRITICAL_FRESH_FLOOR_MS,
      resetExtendedFreshForMs,
    )
  }

  if (metadata.rateLimitRemaining <= GITHUB_RATE_LIMIT_LOW_REMAINING) {
    return Math.max(baseFreshForMs, GITHUB_RATE_LIMIT_LOW_FRESH_FLOOR_MS)
  }

  return baseFreshForMs
}

function getErrorStatusCode(error: unknown) {
  if (!isRecord(error)) return null
  return typeof error.status === "number" ? error.status : null
}

function getErrorResponseHeaders(error: unknown) {
  if (!isRecord(error) || !isRecord(error.response)) return null
  return error.response.headers as Record<string, unknown> | null
}

function normalizeUnknownHeaders(
  headers: Record<string, unknown> | null | undefined,
) {
  if (!headers) return {}
  return Object.entries(headers).reduce<Record<string, string | null>>(
    (acc, [key, value]) => {
      acc[key.toLowerCase()] =
        typeof value === "string"
          ? value
          : value == null
            ? null
            : String(value)
      return acc
    },
    {},
  )
}

function isGitHubRateLimitError(error: unknown) {
  const statusCode = getErrorStatusCode(error)
  if (statusCode !== 403 && statusCode !== 429) return false
  const headers = normalizeUnknownHeaders(getErrorResponseHeaders(error))
  const retryAfter = headers["retry-after"]
  const remaining = parseNullableInt(headers["x-ratelimit-remaining"])
  return retryAfter !== null || remaining === 0 || statusCode === 429
}

function isGitHubForbiddenError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "")
  return (
    msg.includes("OAuth App access restrictions") ||
    msg.includes("FORBIDDEN") ||
    msg.includes("Resource not accessible by integration")
  )
}

function getRateLimitedStaleFreshUntil(currentTime: number, error: unknown) {
  const headers = normalizeUnknownHeaders(getErrorResponseHeaders(error))
  const retryAfterSeconds = parseNullableInt(headers["retry-after"])
  if (typeof retryAfterSeconds === "number" && retryAfterSeconds > 0) {
    return (
      currentTime +
      retryAfterSeconds * 1_000 +
      GITHUB_RATE_LIMIT_RESET_BUFFER_MS
    )
  }

  const resetAtMs = getRateLimitResetMs(
    parseNullableInt(headers["x-ratelimit-reset"]),
  )
  if (typeof resetAtMs === "number") {
    return Math.max(
      currentTime + GITHUB_STALE_IF_RATE_LIMITED_FALLBACK_MS,
      resetAtMs + GITHUB_RATE_LIMIT_RESET_BUFFER_MS,
    )
  }

  return currentTime + GITHUB_STALE_IF_RATE_LIMITED_FALLBACK_MS
}

/**
 * Default Drizzle-backed store. Lazy-imports `@tripwire/db/client` so this
 * module is safe to import from client bundles (the import never resolves
 * unless `get`/`upsert`/`delete` is called).
 */
async function getDefaultGitHubCacheStore(): Promise<GitHubCacheStore> {
  const [{ eq }, { db }, { githubResponseCache }] = await Promise.all([
    import("drizzle-orm"),
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  return {
    async get(cacheKey) {
      const [entry] = await db
        .select()
        .from(githubResponseCache)
        .where(eq(githubResponseCache.cacheKey, cacheKey))
        .limit(1)
      return entry ?? null
    },
    async upsert(entry) {
      await db
        .insert(githubResponseCache)
        .values(entry)
        .onConflictDoUpdate({
          target: githubResponseCache.cacheKey,
          set: {
            scope: entry.scope,
            resource: entry.resource,
            paramsJson: entry.paramsJson,
            etag: entry.etag,
            lastModified: entry.lastModified,
            payloadJson: entry.payloadJson,
            fetchedAt: entry.fetchedAt,
            freshUntil: entry.freshUntil,
            rateLimitRemaining: entry.rateLimitRemaining,
            rateLimitReset: entry.rateLimitReset,
            statusCode: entry.statusCode,
          },
        })
    },
    async delete(cacheKey) {
      await db
        .delete(githubResponseCache)
        .where(eq(githubResponseCache.cacheKey, cacheKey))
    },
  }
}

async function getLatestGitHubRevalidationSignalUpdatedAt(
  signalKeys: string[],
) {
  if (signalKeys.length === 0) return null

  const [{ inArray }, { db }, { githubRevalidationSignal }] = await Promise.all([
    import("drizzle-orm"),
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  const signals = await db
    .select({ updatedAt: githubRevalidationSignal.updatedAt })
    .from(githubRevalidationSignal)
    .where(inArray(githubRevalidationSignal.signalKey, signalKeys))

  if (signals.length === 0) return null
  return Math.max(...signals.map((signal) => signal.updatedAt))
}

export async function markGitHubRevalidationSignals(
  signalKeys: string[],
  at = Date.now(),
) {
  if (signalKeys.length === 0) return 0

  const uniqueSignalKeys = Array.from(new Set(signalKeys))
  const [{ db }, { githubRevalidationSignal }] = await Promise.all([
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  await db
    .insert(githubRevalidationSignal)
    .values(
      uniqueSignalKeys.map((signalKey) => ({ signalKey, updatedAt: at })),
    )
    .onConflictDoUpdate({
      target: githubRevalidationSignal.signalKey,
      set: { updatedAt: at },
    })

  return uniqueSignalKeys.length
}

/**
 * Records a webhook delivery for idempotency + audit/replay. Insert is
 * idempotent on `deliveryId` — GitHub retries reuse the same
 * `X-GitHub-Delivery` UUID, so the second attempt is a no-op. Returns
 * true when a NEW row was inserted (i.e. this is the first time we've
 * seen this delivery and the caller should process it).
 */
export async function recordGitHubWebhookEvent({
  deliveryId,
  event,
  signalKeys,
  receivedAt = Date.now(),
}: {
  deliveryId: string
  event: string
  signalKeys: string[]
  receivedAt?: number
}): Promise<boolean> {
  const [{ db }, { githubWebhookEvent }] = await Promise.all([
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  const inserted = await db
    .insert(githubWebhookEvent)
    .values({
      deliveryId,
      event,
      signalKeysJson: JSON.stringify(signalKeys),
      receivedAt,
    })
    .onConflictDoNothing({ target: githubWebhookEvent.deliveryId })
    .returning({ id: githubWebhookEvent.id })

  return inserted.length > 0
}

/** Marks a previously-recorded webhook delivery as processed (clears any prior error). */
export async function markGitHubWebhookEventProcessed(
  deliveryId: string,
  at = Date.now(),
): Promise<void> {
  const [{ eq }, { db }, { githubWebhookEvent }] = await Promise.all([
    import("drizzle-orm"),
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  await db
    .update(githubWebhookEvent)
    .set({ processedAt: at, errorMessage: null })
    .where(eq(githubWebhookEvent.deliveryId, deliveryId))
}

/** Records a processing failure on the webhook row so it surfaces in logs. */
export async function markGitHubWebhookEventFailed(
  deliveryId: string,
  errorMessage: string,
): Promise<void> {
  const [{ eq }, { db }, { githubWebhookEvent }] = await Promise.all([
    import("drizzle-orm"),
    import("@tripwire/db/client"),
    import("@tripwire/db"),
  ])

  await db
    .update(githubWebhookEvent)
    .set({ errorMessage: errorMessage.slice(0, 2000) })
    .where(eq(githubWebhookEvent.deliveryId, deliveryId))
}

export async function getGitHubRevalidationSignals(signalKeys: string[]) {
  if (signalKeys.length === 0) return []

  const uniqueSignalKeys = Array.from(new Set(signalKeys))
  const [{ inArray }, { db }, { githubRevalidationSignal }] = await Promise.all(
    [
      import("drizzle-orm"),
      import("@tripwire/db/client"),
      import("@tripwire/db"),
    ],
  )

  return db
    .select({
      signalKey: githubRevalidationSignal.signalKey,
      updatedAt: githubRevalidationSignal.updatedAt,
    })
    .from(githubRevalidationSignal)
    .where(inArray(githubRevalidationSignal.signalKey, uniqueSignalKeys))
}

export async function bustGitHubCache(
  scope: string,
  resource: string,
  params?: unknown,
) {
  const store = await getDefaultGitHubCacheStore()
  const paramsJson = stableSerialize(params)
  const cacheKey = buildGitHubCacheKey({ scope, resource, paramsJson })
  await store.delete(cacheKey)
}

/**
 * Read whatever's currently cached without triggering a revalidation.
 * Returns the parsed payload (even past `fresh_until`) or null when no
 * entry exists. For opportunistic consumers like the custom-rules
 * simulator that want cached data when present but won't pay a GitHub
 * round-trip on miss.
 */
export async function peekGitHubCache<TData>(
  scope: string,
  resource: string,
  params?: unknown,
  storeOverride?: GitHubCacheStore,
): Promise<TData | null> {
  const store = storeOverride ?? (await getDefaultGitHubCacheStore())
  const paramsJson = stableSerialize(params)
  const cacheKey = buildGitHubCacheKey({ scope, resource, paramsJson })
  const entry = await store.get(cacheKey)
  if (!entry) return null
  return parseCachedPayload<TData>(entry.payloadJson)
}

export function createGitHubResponseMetadata(
  statusCode: number,
  headers: Record<string, string | null | undefined>,
): GitHubResponseMetadata {
  return {
    etag: headers.etag ?? null,
    lastModified: headers["last-modified"] ?? null,
    rateLimitRemaining: parseNullableInt(headers["x-ratelimit-remaining"]),
    rateLimitReset: parseNullableInt(headers["x-ratelimit-reset"]),
    statusCode,
  }
}

export async function getOrRevalidateGitHubResource<TData>({
  scope,
  resource,
  params,
  freshForMs,
  signalKeys = [],
  fetcher,
  merge,
  now = Date.now,
  store,
  inFlightCache,
  getLatestSignalUpdatedAt = getLatestGitHubRevalidationSignalUpdatedAt,
}: GetOrRevalidateGitHubResourceOptions<TData>): Promise<TData> {
  let resolvedStore = store ?? null
  const paramsJson = stableSerialize(params)
  const cacheKey = buildGitHubCacheKey({ scope, resource, paramsJson })
  const resolvedInFlightCache =
    inFlightCache ?? (await getRequestScopedInFlightCache())

  // Two callers in the same request asking for the same resource share one promise.
  const existingInFlight = resolvedInFlightCache?.get(cacheKey)
  if (existingInFlight) {
    return existingInFlight as Promise<TData>
  }

  const task = (async () => {
    if (!resolvedStore) {
      resolvedStore = await getDefaultGitHubCacheStore()
    }
    const existingEntry = await resolvedStore.get(cacheKey)
    const currentTime = now()
    const latestSignalUpdatedAt =
      signalKeys.length > 0 ? await getLatestSignalUpdatedAt(signalKeys) : null
    const isSignalNewerThanCache = Boolean(
      existingEntry &&
        typeof latestSignalUpdatedAt === "number" &&
        latestSignalUpdatedAt > existingEntry.fetchedAt,
    )

    if (
      existingEntry &&
      existingEntry.freshUntil > currentTime &&
      !isSignalNewerThanCache
    ) {
      return parseCachedPayload<TData>(existingEntry.payloadJson)
    }

    let result: GitHubFetchResult<TData>
    try {
      result = await fetcher({
        etag: existingEntry?.etag ?? null,
        lastModified: existingEntry?.lastModified ?? null,
      })
    } catch (error) {
      if (existingEntry && isGitHubRateLimitError(error)) {
        const staleEntry = {
          ...existingEntry,
          freshUntil: getRateLimitedStaleFreshUntil(currentTime, error),
          statusCode: getErrorStatusCode(error) ?? existingEntry.statusCode,
        }
        await resolvedStore.upsert(staleEntry)
        return parseCachedPayload<TData>(existingEntry.payloadJson)
      }

      if (existingEntry && isGitHubForbiddenError(error)) {
        const staleEntry = {
          ...existingEntry,
          freshUntil: currentTime + GITHUB_STALE_IF_FORBIDDEN_MS,
          statusCode: getErrorStatusCode(error) ?? existingEntry.statusCode,
        }
        await resolvedStore.upsert(staleEntry)
        return parseCachedPayload<TData>(existingEntry.payloadJson)
      }

      throw error
    }

    if (result.kind === "not-modified") {
      if (!existingEntry) {
        throw new Error(
          `GitHub returned 304 without a cached payload for ${resource}.`,
        )
      }
      const refreshedEntry = {
        ...existingEntry,
        etag: result.metadata.etag ?? existingEntry.etag,
        lastModified: result.metadata.lastModified ?? existingEntry.lastModified,
        fetchedAt: currentTime,
        freshUntil:
          currentTime +
          getAdaptiveFreshForMs(currentTime, freshForMs, result.metadata),
        rateLimitRemaining: result.metadata.rateLimitRemaining,
        rateLimitReset: result.metadata.rateLimitReset,
        statusCode: result.metadata.statusCode,
      }
      await resolvedStore.upsert(refreshedEntry)
      return parseCachedPayload<TData>(existingEntry.payloadJson)
    }

    const mergedData =
      merge && existingEntry
        ? merge(
            parseCachedPayload<TData>(existingEntry.payloadJson),
            result.data,
          )
        : result.data

    const nextEntry: GitHubCacheStoreEntry = {
      cacheKey,
      scope,
      resource,
      paramsJson,
      etag: result.metadata.etag,
      lastModified: result.metadata.lastModified,
      payloadJson: JSON.stringify(mergedData),
      fetchedAt: currentTime,
      freshUntil:
        currentTime +
        getAdaptiveFreshForMs(currentTime, freshForMs, result.metadata),
      rateLimitRemaining: result.metadata.rateLimitRemaining,
      rateLimitReset: result.metadata.rateLimitReset,
      statusCode: result.metadata.statusCode,
    }
    await resolvedStore.upsert(nextEntry)
    return mergedData
  })()

  resolvedInFlightCache?.set(cacheKey, task)

  try {
    return await task
  } finally {
    resolvedInFlightCache?.delete(cacheKey)
  }
}

/**
 * Stale-while-revalidate variant. Returns immediately with whatever's
 * cached (even past `fresh_until`) and kicks off a background refresh
 * if the entry is stale. Used for "feels instant" surfaces — AI chat
 * tools, the custom-rules simulator preview, dashboards.
 *
 * Tripwire runs on long-lived Node servers so the background refresh
 * is a fire-and-forget Promise. On Workers you'd pass an
 * `executionContext.waitUntil` equivalent, but Node keeps the process
 * alive past the response without help.
 */
export async function getGitHubResourceLocalFirst<TData>(
  options: GetOrRevalidateGitHubResourceOptions<TData> & {
    /** Called after a background revalidate completes AND the cached data changed. Best-effort. */
    onBackgroundRefreshSettled?: () => Promise<void> | void
  },
): Promise<{ data: TData; meta: GitHubLocalFirstMeta }> {
  const {
    scope,
    resource,
    params,
    signalKeys = [],
    now = Date.now,
    store,
    getLatestSignalUpdatedAt = getLatestGitHubRevalidationSignalUpdatedAt,
    onBackgroundRefreshSettled,
  } = options

  const resolvedStore = store ?? (await getDefaultGitHubCacheStore())
  const paramsJson = stableSerialize(params)
  const cacheKey = buildGitHubCacheKey({ scope, resource, paramsJson })
  const existingEntry = await resolvedStore.get(cacheKey)
  const currentTime = now()

  const latestSignalUpdatedAt =
    signalKeys.length > 0 ? await getLatestSignalUpdatedAt(signalKeys) : null
  const isSignalNewerThanCache = Boolean(
    existingEntry &&
      typeof latestSignalUpdatedAt === "number" &&
      latestSignalUpdatedAt > existingEntry.fetchedAt,
  )

  // Fresh: serve cached, no refresh.
  if (
    existingEntry &&
    existingEntry.freshUntil > currentTime &&
    !isSignalNewerThanCache
  ) {
    return {
      data: parseCachedPayload<TData>(existingEntry.payloadJson),
      meta: {
        cacheStatus: "fresh",
        fetchedAt: existingEntry.fetchedAt,
        isRevalidating: false,
      },
    }
  }

  // Stale: serve cached payload immediately, kick off background refresh.
  if (existingEntry) {
    const previousFetchedAt = existingEntry.fetchedAt
    const refreshPromise = getOrRevalidateGitHubResource({
      ...options,
      store: resolvedStore,
      getLatestSignalUpdatedAt,
      now,
    })
      .then(async () => {
        if (!onBackgroundRefreshSettled) return
        const next = await resolvedStore.get(cacheKey)
        if (next && next.fetchedAt > previousFetchedAt) {
          await onBackgroundRefreshSettled()
        }
      })
      .catch(() => {
        // Best-effort: caller already got the stale payload; failure here is logged-only.
      })
    void refreshPromise

    return {
      data: parseCachedPayload<TData>(existingEntry.payloadJson),
      meta: {
        cacheStatus: "stale",
        fetchedAt: existingEntry.fetchedAt,
        isRevalidating: true,
      },
    }
  }

  // Miss: no cache, must fetch live.
  const data = await getOrRevalidateGitHubResource({
    ...options,
    store: resolvedStore,
    getLatestSignalUpdatedAt,
    now,
  })
  return {
    data,
    meta: { cacheStatus: "miss", fetchedAt: null, isRevalidating: false },
  }
}
