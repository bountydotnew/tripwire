import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query"

/**
 * localStorage query persistence with explicit opt-in.
 *
 * Wire `createQueryClientPersistence(queryClient)` once per QueryClient
 * (it's a no-op on the server). Mark queries with `meta: { persist: true }`
 * to participate — everything else is excluded.
 *
 * Why opt-in: we don't want every tRPC query persisting by default
 * (rapidly-changing data would just stale the localStorage cache; some
 * data is sensitive and shouldn't survive across sessions).
 */

const STORAGE_KEY = "tw:query-cache:v1"
const PERSIST_TTL_MS = 24 * 60 * 60 * 1000 // 24h
const WRITE_DEBOUNCE_MS = 250

type PersistedState = {
  version: 1
  persistedAt: number
  clientState: unknown
}

type PersistableQuery = {
  state: { data?: unknown; status: string }
  meta?: Record<string, unknown>
  queryKey: readonly unknown[]
}

/** Pure: should this query be written to localStorage? Tested in isolation. */
export function shouldPersistQuery(query: PersistableQuery): boolean {
  if (query.state.status !== "success") return false
  if (query.state.data == null) return false
  return query.meta?.persist === true
}

/** Pure: is this persisted blob still usable? Tested in isolation. */
export function isPersistedStateUsable(
  raw: string | null,
  now: number = Date.now(),
): PersistedState | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    if (parsed.version !== 1) return null
    if (typeof parsed.persistedAt !== "number") return null
    if (now - parsed.persistedAt > PERSIST_TTL_MS) return null
    return parsed as PersistedState
  } catch {
    return null
  }
}

/**
 * Restore a previously-persisted snapshot into the client (browser only).
 * Drops rows whose `data == null` post-hydration (defensive against
 * partial / corrupted writes).
 */
export function restorePersistedQueryCache(queryClient: QueryClient) {
  if (typeof window === "undefined") return

  const raw = window.localStorage.getItem(STORAGE_KEY)
  const usable = isPersistedStateUsable(raw)
  if (!usable) {
    if (raw) window.localStorage.removeItem(STORAGE_KEY)
    return
  }

  try {
    hydrate(queryClient, usable.clientState)
    queryClient.removeQueries({
      predicate: (q) => q.state.data == null,
    })
  } catch {
    window.localStorage.removeItem(STORAGE_KEY)
  }
}

/**
 * Subscribe to cache changes and write the opt-in subset to localStorage,
 * debounced. Returns a teardown fn. No-op on the server.
 */
export function startQueryCachePersistence(queryClient: QueryClient): () => void {
  if (typeof window === "undefined") return () => undefined

  let timeoutId: number | undefined

  const writeCache = () => {
    const clientState = dehydrate(queryClient, {
      shouldDehydrateQuery: shouldPersistQuery,
    })
    if (clientState.queries.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY)
      return
    }
    const payload: PersistedState = {
      version: 1,
      persistedAt: Date.now(),
      clientState,
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      // Quota exceeded or storage disabled — drop silently.
    }
  }

  const scheduleWrite = () => {
    if (typeof timeoutId !== "undefined") {
      window.clearTimeout(timeoutId)
    }
    timeoutId = window.setTimeout(writeCache, WRITE_DEBOUNCE_MS)
  }

  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    scheduleWrite()
  })

  const flushOnUnload = () => {
    if (typeof timeoutId !== "undefined") {
      window.clearTimeout(timeoutId)
      timeoutId = undefined
    }
    writeCache()
  }

  window.addEventListener("beforeunload", flushOnUnload)

  return () => {
    unsubscribe()
    window.removeEventListener("beforeunload", flushOnUnload)
    if (typeof timeoutId !== "undefined") {
      window.clearTimeout(timeoutId)
    }
  }
}

/** One-shot convenience: hydrate now + start persisting. */
export function attachQueryClientPersistence(
  queryClient: QueryClient,
): () => void {
  restorePersistedQueryCache(queryClient)
  return startQueryCachePersistence(queryClient)
}

/** Exported for unit tests. */
export const __internal = {
  STORAGE_KEY,
  PERSIST_TTL_MS,
  WRITE_DEBOUNCE_MS,
}
