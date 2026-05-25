import { describe, expect, it, vi } from "vitest"
import {
  createGitHubResponseMetadata,
  type GitHubCacheStore,
  type GitHubCacheStoreEntry,
  type GitHubFetchResult,
  getGitHubResourceLocalFirst,
  getOrRevalidateGitHubResource,
  peekGitHubCache,
} from "./cache"

// Short-circuit the request-scoped in-flight cache for tests that
// don't pass an explicit inFlightCache.
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => {
    throw new Error("Not in request context")
  },
}))

function createMemoryStore(
  initialEntries: GitHubCacheStoreEntry[] = [],
): GitHubCacheStore {
  const entries = new Map(
    initialEntries.map((entry) => [entry.cacheKey, structuredClone(entry)]),
  )

  return {
    async get(cacheKey) {
      return entries.get(cacheKey) ?? null
    },
    async upsert(entry) {
      entries.set(entry.cacheKey, structuredClone(entry))
    },
    async delete(cacheKey) {
      entries.delete(cacheKey)
    },
  }
}

function buildEntry(
  overrides: Partial<GitHubCacheStoreEntry> = {},
): GitHubCacheStoreEntry {
  return {
    cacheKey: "torvalds::user.profile::null",
    scope: "torvalds",
    resource: "user.profile",
    paramsJson: "null",
    etag: '"profile-etag"',
    lastModified: "Tue, 01 Apr 2025 10:00:00 GMT",
    payloadJson: JSON.stringify({ login: "torvalds" }),
    fetchedAt: 100,
    freshUntil: 200,
    rateLimitRemaining: 4999,
    rateLimitReset: 1712487600,
    statusCode: 200,
    ...overrides,
  }
}

describe("getOrRevalidateGitHubResource", () => {
  it("returns a fresh cached payload without calling GitHub", async () => {
    const store = createMemoryStore([buildEntry()])
    const fetcher =
      vi.fn<
        (parameters: {
          etag?: string | null
          lastModified?: string | null
        }) => Promise<GitHubFetchResult<{ login: string }>>
      >()

    const result = await getOrRevalidateGitHubResource({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 60_000,
      store,
      now: () => 150,
      fetcher,
    })

    expect(result).toEqual({ login: "torvalds" })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("revalidates stale data with conditional headers and preserves payload on 304", async () => {
    const store = createMemoryStore([buildEntry({ freshUntil: 50 })])
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ login: string }>>
    >(async (conditionals) => {
      expect(conditionals).toEqual({
        etag: '"profile-etag"',
        lastModified: "Tue, 01 Apr 2025 10:00:00 GMT",
      })
      return {
        kind: "not-modified",
        metadata: createGitHubResponseMetadata(304, {
          etag: '"profile-etag"',
          "x-ratelimit-remaining": "4988",
          "x-ratelimit-reset": "1712487601",
        }),
      }
    })

    const result = await getOrRevalidateGitHubResource({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 1_000,
      store,
      now: () => 500,
      fetcher,
    })

    expect(result).toEqual({ login: "torvalds" })
    expect(fetcher).toHaveBeenCalledTimes(1)

    const updatedEntry = await store.get("torvalds::user.profile::null")
    expect(updatedEntry?.freshUntil).toBe(1_500)
    expect(updatedEntry?.rateLimitRemaining).toBe(4988)
    expect(updatedEntry?.statusCode).toBe(304)
  })

  it("deduplicates concurrent stale refreshes for the same cache key", async () => {
    const inFlightCache = new Map<string, Promise<unknown>>()
    const store = createMemoryStore([
      buildEntry({
        resource: "user.prs",
        cacheKey: 'torvalds::user.prs::{"state":"merged"}',
        paramsJson: '{"state":"merged"}',
        freshUntil: 0,
        payloadJson: JSON.stringify([{ id: 1 }]),
      }),
    ])
    let resolveFetch:
      | ((value: GitHubFetchResult<Array<{ id: number }>>) => void)
      | undefined
    const fetcher = vi.fn(
      () =>
        new Promise<GitHubFetchResult<Array<{ id: number }>>>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const promiseA = getOrRevalidateGitHubResource({
      inFlightCache,
      scope: "torvalds",
      resource: "user.prs",
      params: { state: "merged" },
      freshForMs: 1_000,
      store,
      now: () => 10,
      fetcher,
    })
    const promiseB = getOrRevalidateGitHubResource({
      inFlightCache,
      scope: "torvalds",
      resource: "user.prs",
      params: { state: "merged" },
      freshForMs: 1_000,
      store,
      now: () => 10,
      fetcher,
    })

    await vi.waitFor(() => {
      expect(fetcher).toHaveBeenCalledTimes(1)
    })

    resolveFetch?.({
      kind: "success",
      data: [{ id: 2 }],
      metadata: createGitHubResponseMetadata(200, { etag: '"next"' }),
    })

    await expect(Promise.all([promiseA, promiseB])).resolves.toEqual([
      [{ id: 2 }],
      [{ id: 2 }],
    ])
  })

  it("isolates cache entries by scope even when the resource name matches", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "torvalds",
        cacheKey: "torvalds::user.repos::null",
        resource: "user.repos",
        payloadJson: JSON.stringify([{ fullName: "torvalds/linux" }]),
      }),
      buildEntry({
        scope: "tj",
        cacheKey: "tj::user.repos::null",
        resource: "user.repos",
        payloadJson: JSON.stringify([{ fullName: "tj/commander.js" }]),
      }),
    ])

    await expect(
      getOrRevalidateGitHubResource({
        scope: "torvalds",
        resource: "user.repos",
        freshForMs: 60_000,
        store,
        now: () => 150,
        fetcher: vi.fn(),
      }),
    ).resolves.toEqual([{ fullName: "torvalds/linux" }])

    await expect(
      getOrRevalidateGitHubResource({
        scope: "tj",
        resource: "user.repos",
        freshForMs: 60_000,
        store,
        now: () => 150,
        fetcher: vi.fn(),
      }),
    ).resolves.toEqual([{ fullName: "tj/commander.js" }])
  })

  it("treats a newer revalidation signal as stale even before freshUntil expires", async () => {
    const store = createMemoryStore([
      buildEntry({
        resource: "pull.detail",
        cacheKey:
          'octocat::pull.detail::{"owner":"octocat","repo":"hello","pullNumber":42}',
        paramsJson:
          '{"owner":"octocat","repo":"hello","pullNumber":42}',
        scope: "octocat",
        payloadJson: JSON.stringify({ title: "Old title" }),
        fetchedAt: 1_000,
        freshUntil: 100_000,
      }),
    ])
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ title: string }>>
    >(async () => ({
      kind: "success",
      data: { title: "New title" },
      metadata: createGitHubResponseMetadata(200, { etag: '"next"' }),
    }))

    const result = await getOrRevalidateGitHubResource({
      scope: "octocat",
      resource: "pull.detail",
      params: { owner: "octocat", repo: "hello", pullNumber: 42 },
      signalKeys: ["pull:octocat/hello#42"],
      freshForMs: 60_000,
      store,
      now: () => 5_000,
      getLatestSignalUpdatedAt: async () => 4_000,
      fetcher,
    })

    expect(result).toEqual({ title: "New title" })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("extends freshness when GitHub budget is low", async () => {
    const store = createMemoryStore([buildEntry({ freshUntil: 50 })])
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ login: string }>>
    >(async () => ({
      kind: "success",
      data: { login: "torvalds" },
      metadata: createGitHubResponseMetadata(200, {
        etag: '"next"',
        "x-ratelimit-remaining": "10",
        "x-ratelimit-reset": "0",
      }),
    }))

    const result = await getOrRevalidateGitHubResource({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 15_000,
      store,
      now: () => 500,
      fetcher,
    })

    expect(result).toEqual({ login: "torvalds" })

    const updatedEntry = await store.get("torvalds::user.profile::null")
    // 10 remaining ≤ critical threshold (25) → floor at 5 min
    expect(updatedEntry?.freshUntil).toBe(300_500)
    expect(updatedEntry?.rateLimitRemaining).toBe(10)
  })

  it("serves stale cache when GitHub is rate limited", async () => {
    const store = createMemoryStore([buildEntry({ freshUntil: 50 })])

    const result = await getOrRevalidateGitHubResource({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 1_000,
      store,
      now: () => 500,
      fetcher: vi.fn(async () => {
        throw {
          status: 403,
          response: {
            headers: {
              "x-ratelimit-remaining": "0",
              "x-ratelimit-reset": "2",
            },
          },
        }
      }),
    })

    expect(result).toEqual({ login: "torvalds" })

    const updatedEntry = await store.get("torvalds::user.profile::null")
    // reset at epoch second 2 = 2000ms → max(currentTime + 60_000ms fallback, 2000ms + 5s buffer) = 60_500
    expect(updatedEntry?.freshUntil).toBe(60_500)
    expect(updatedEntry?.statusCode).toBe(403)
  })

  it("serves stale cache briefly when GitHub returns a forbidden access-restriction error", async () => {
    const store = createMemoryStore([buildEntry({ freshUntil: 50 })])

    const result = await getOrRevalidateGitHubResource({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 1_000,
      store,
      now: () => 500,
      fetcher: vi.fn(async () => {
        throw new Error("OAuth App access restrictions blocking org access")
      }),
    })

    expect(result).toEqual({ login: "torvalds" })

    const updatedEntry = await store.get("torvalds::user.profile::null")
    // GITHUB_STALE_IF_FORBIDDEN_MS = 30_000
    expect(updatedEntry?.freshUntil).toBe(30_500)
  })

  it("produces stable cache keys regardless of param object key order", async () => {
    const store = createMemoryStore()
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ ok: true }>>
    >(async () => ({
      kind: "success",
      data: { ok: true },
      metadata: createGitHubResponseMetadata(200, {}),
    }))

    await getOrRevalidateGitHubResource({
      scope: "octocat",
      resource: "pull.detail",
      params: { owner: "octocat", repo: "hello", pullNumber: 42 },
      freshForMs: 60_000,
      store,
      now: () => 100,
      fetcher,
    })

    // Same params, different key order → must hit the same cache entry, no second fetch.
    await getOrRevalidateGitHubResource({
      scope: "octocat",
      resource: "pull.detail",
      params: { pullNumber: 42, repo: "hello", owner: "octocat" },
      freshForMs: 60_000,
      store,
      now: () => 150,
      fetcher,
    })

    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("merges existing cached data with fresh data when a merge fn is provided", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "octocat",
        cacheKey: "octocat::user.search::null",
        resource: "user.search",
        payloadJson: JSON.stringify({ items: [{ id: 1 }] }),
        freshUntil: 50,
      }),
    ])

    const result = await getOrRevalidateGitHubResource<{
      items: Array<{ id: number }>
    }>({
      scope: "octocat",
      resource: "user.search",
      freshForMs: 1_000,
      store,
      now: () => 500,
      fetcher: async () => ({
        kind: "success",
        data: { items: [{ id: 2 }] },
        metadata: createGitHubResponseMetadata(200, {}),
      }),
      merge: (existing, fresh) => ({
        items: [...existing.items, ...fresh.items],
      }),
    })

    expect(result).toEqual({ items: [{ id: 1 }, { id: 2 }] })
  })

  it("peekGitHubCache returns the parsed payload when an entry exists (even past freshUntil)", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "torvalds",
        cacheKey: "torvalds::user.profile::null",
        resource: "user.profile",
        // Entry is past its fresh window, but peek still returns it.
        freshUntil: 0,
        payloadJson: JSON.stringify({ login: "torvalds" }),
      }),
    ])

    const result = await peekGitHubCache<{ login: string }>(
      "torvalds",
      "user.profile",
      undefined,
      store,
    )
    expect(result).toEqual({ login: "torvalds" })
  })

  it("peekGitHubCache returns null when no entry exists", async () => {
    const store = createMemoryStore()
    const result = await peekGitHubCache<{ login: string }>(
      "unknown",
      "user.profile",
      undefined,
      store,
    )
    expect(result).toBeNull()
  })

  it("re-throws non-rate-limit fetcher errors and leaves the cache entry alone", async () => {
    const before = buildEntry({ freshUntil: 50 })
    const store = createMemoryStore([before])

    await expect(
      getOrRevalidateGitHubResource({
        scope: "torvalds",
        resource: "user.profile",
        freshForMs: 1_000,
        store,
        now: () => 500,
        fetcher: vi.fn(async () => {
          throw new Error("network unreachable")
        }),
      }),
    ).rejects.toThrow("network unreachable")

    const after = await store.get("torvalds::user.profile::null")
    expect(after).toEqual(before)
  })
})

describe("getGitHubResourceLocalFirst", () => {
  it("returns cached payload with cacheStatus 'fresh' and never calls the fetcher when entry is fresh", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "torvalds",
        cacheKey: "torvalds::user.profile::null",
        resource: "user.profile",
        freshUntil: 1_000,
        payloadJson: JSON.stringify({ login: "torvalds" }),
        fetchedAt: 100,
      }),
    ])
    const fetcher = vi.fn()

    const result = await getGitHubResourceLocalFirst<{ login: string }>({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 60_000,
      store,
      now: () => 500,
      fetcher,
    })

    expect(result.data).toEqual({ login: "torvalds" })
    expect(result.meta).toEqual({
      cacheStatus: "fresh",
      fetchedAt: 100,
      isRevalidating: false,
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it("returns the stale payload immediately and kicks off a background revalidate", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "torvalds",
        cacheKey: "torvalds::user.profile::null",
        resource: "user.profile",
        freshUntil: 0,
        fetchedAt: 100,
        payloadJson: JSON.stringify({ login: "old" }),
      }),
    ])
    let resolveFetch:
      | ((value: GitHubFetchResult<{ login: string }>) => void)
      | undefined
    const fetcher = vi.fn(
      () =>
        new Promise<GitHubFetchResult<{ login: string }>>((resolve) => {
          resolveFetch = resolve
        }),
    )

    const result = await getGitHubResourceLocalFirst<{ login: string }>({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 60_000,
      store,
      now: () => 500,
      fetcher,
    })

    // Stale payload served synchronously.
    expect(result.data).toEqual({ login: "old" })
    expect(result.meta).toEqual({
      cacheStatus: "stale",
      fetchedAt: 100,
      isRevalidating: true,
    })

    // Drain microtasks until the background task actually invoked the fetcher
    // (resolveFetch is captured inside the fetcher closure, so it isn't
    // defined until then).
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalled())

    resolveFetch?.({
      kind: "success",
      data: { login: "new" },
      metadata: createGitHubResponseMetadata(200, { etag: '"next"' }),
    })
    await vi.waitFor(async () => {
      const updated = await store.get("torvalds::user.profile::null")
      expect(JSON.parse(updated?.payloadJson ?? "{}")).toEqual({
        login: "new",
      })
    })
  })

  it("calls onBackgroundRefreshSettled after a successful background refresh", async () => {
    const store = createMemoryStore([
      buildEntry({
        scope: "torvalds",
        cacheKey: "torvalds::user.profile::null",
        resource: "user.profile",
        freshUntil: 0,
        fetchedAt: 100,
        payloadJson: JSON.stringify({ login: "old" }),
      }),
    ])
    const onSettled = vi.fn()
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ login: string }>>
    >(async () => ({
      kind: "success",
      data: { login: "new" },
      metadata: createGitHubResponseMetadata(200, { etag: '"next"' }),
    }))

    await getGitHubResourceLocalFirst<{ login: string }>({
      scope: "torvalds",
      resource: "user.profile",
      freshForMs: 60_000,
      store,
      now: () => 500,
      fetcher,
      onBackgroundRefreshSettled: onSettled,
    })

    await vi.waitFor(() => {
      expect(onSettled).toHaveBeenCalledTimes(1)
    })
  })

  it("falls through to a live fetch with cacheStatus 'miss' when no cache exists", async () => {
    const store = createMemoryStore()
    const fetcher = vi.fn<
      (parameters: {
        etag?: string | null
        lastModified?: string | null
      }) => Promise<GitHubFetchResult<{ login: string }>>
    >(async () => ({
      kind: "success",
      data: { login: "new" },
      metadata: createGitHubResponseMetadata(200, { etag: '"e1"' }),
    }))

    const result = await getGitHubResourceLocalFirst<{ login: string }>({
      scope: "nobody",
      resource: "user.profile",
      freshForMs: 60_000,
      store,
      now: () => 500,
      fetcher,
    })

    expect(result.data).toEqual({ login: "new" })
    expect(result.meta).toEqual({
      cacheStatus: "miss",
      fetchedAt: null,
      isRevalidating: false,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
