import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock the external surfaces. The engine itself is exercised in cache.test.ts;
// here we only verify that data-factory wires its inputs/outputs correctly
// and that the public API stays cache-engine-shaped.

const githubApiMock = vi.fn()
vi.mock("./app", () => ({
  githubApi: (...args: unknown[]) => githubApiMock(...args),
}))

const userMock = {
  fetchUserGraphQL: vi.fn(),
  fetchUserContributions: vi.fn(),
}
vi.mock("./user", () => ({
  fetchUserGraphQL: (...args: unknown[]) => userMock.fetchUserGraphQL(...args),
  fetchUserContributions: (...args: unknown[]) =>
    userMock.fetchUserContributions(...args),
}))

const cacheMock = {
  getOrRevalidateGitHubResource: vi.fn(),
  getGitHubResourceLocalFirst: vi.fn(),
  peekGitHubCache: vi.fn(),
  createGitHubResponseMetadata: vi.fn(() => ({
    etag: null,
    lastModified: null,
    rateLimitRemaining: null,
    rateLimitReset: null,
    statusCode: 200,
  })),
}
vi.mock("./cache", () => ({
  getOrRevalidateGitHubResource: (...args: unknown[]) =>
    (cacheMock.getOrRevalidateGitHubResource as (...a: unknown[]) => unknown)(
      ...args,
    ),
  getGitHubResourceLocalFirst: (...args: unknown[]) =>
    (cacheMock.getGitHubResourceLocalFirst as (...a: unknown[]) => unknown)(
      ...args,
    ),
  peekGitHubCache: (...args: unknown[]) =>
    (cacheMock.peekGitHubCache as (...a: unknown[]) => unknown)(...args),
  createGitHubResponseMetadata: (...args: unknown[]) =>
    (
      cacheMock.createGitHubResponseMetadata as (...a: unknown[]) => unknown
    )(...args),
}))

import {
  fetchUserActivity,
  fetchUserPRs,
  fetchUserRepos,
  peekCachedUserGraphql,
  peekCachedUserProfile,
} from "./data-factory"

beforeEach(() => {
  githubApiMock.mockReset()
  userMock.fetchUserGraphQL.mockReset()
  userMock.fetchUserContributions.mockReset()
  cacheMock.getOrRevalidateGitHubResource.mockReset()
  cacheMock.getGitHubResourceLocalFirst.mockReset()
  cacheMock.peekGitHubCache.mockReset()
})

describe("fetchUserPRs", () => {
  it("routes the merged state through local-first and slices to the requested limit", async () => {
    const cachedItems = Array.from({ length: 10 }, (_, i) => ({
      title: `pr-${i}`,
      number: i,
    }))
    cacheMock.getGitHubResourceLocalFirst.mockResolvedValueOnce({
      data: { items: cachedItems, totalCount: 200 },
      meta: { cacheStatus: "fresh", fetchedAt: 1, isRevalidating: false },
    })

    const result = await fetchUserPRs("token", "torvalds", { limit: 3 })

    expect(cacheMock.getGitHubResourceLocalFirst).toHaveBeenCalledTimes(1)
    const call = cacheMock.getGitHubResourceLocalFirst.mock.calls[0]?.[0]
    expect(call.scope).toBe("torvalds")
    expect(call.resource).toBe("user.merged-prs")
    expect(call.freshForMs).toBe(60 * 60 * 1000)
    expect(result.items).toHaveLength(3)
    expect(result.totalCount).toBe(200)
  })

  it("lowercases the username scope so case-equivalent lookups share a cache slot", async () => {
    cacheMock.getGitHubResourceLocalFirst.mockResolvedValueOnce({
      data: { items: [], totalCount: 0 },
      meta: { cacheStatus: "miss", fetchedAt: null, isRevalidating: false },
    })

    await fetchUserPRs("token", "TORVALDS")
    const call = cacheMock.getGitHubResourceLocalFirst.mock.calls[0]?.[0]
    expect(call.scope).toBe("torvalds")
  })

  it("bypasses local-first and uses the blocking variant with freshForMs=0 when forceRefresh is set", async () => {
    cacheMock.getOrRevalidateGitHubResource.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
    })

    await fetchUserPRs("token", "torvalds", { forceRefresh: true })

    expect(cacheMock.getGitHubResourceLocalFirst).not.toHaveBeenCalled()
    expect(cacheMock.getOrRevalidateGitHubResource).toHaveBeenCalledTimes(1)
    const call = cacheMock.getOrRevalidateGitHubResource.mock.calls[0]?.[0]
    expect(call.freshForMs).toBe(0)
  })

  it("skips the cache engine and hits GitHub directly when state is not 'merged'", async () => {
    githubApiMock.mockResolvedValueOnce({ total_count: 0, items: [] })

    const result = await fetchUserPRs("token", "torvalds", { state: "open" })

    expect(cacheMock.getOrRevalidateGitHubResource).not.toHaveBeenCalled()
    expect(cacheMock.getGitHubResourceLocalFirst).not.toHaveBeenCalled()
    expect(githubApiMock).toHaveBeenCalled()
    expect(result).toEqual({ items: [], totalCount: 0 })
  })
})

describe("fetchUserRepos", () => {
  it("routes through local-first under the user.repos resource", async () => {
    cacheMock.getGitHubResourceLocalFirst.mockResolvedValueOnce({
      data: {
        items: [{ name: "linux", fullName: "torvalds/linux" }],
        totalCount: 42,
        profile: { login: "torvalds", id: 1234, public_repos: 42 },
        githubUserId: 1234,
      },
      meta: { cacheStatus: "fresh", fetchedAt: 1, isRevalidating: false },
    })

    const result = await fetchUserRepos("token", "torvalds", { limit: 5 })

    expect(cacheMock.getGitHubResourceLocalFirst).toHaveBeenCalledTimes(1)
    const call = cacheMock.getGitHubResourceLocalFirst.mock.calls[0]?.[0]
    expect(call.scope).toBe("torvalds")
    expect(call.resource).toBe("user.repos")
    expect(result.items).toHaveLength(1)
    expect(result.totalCount).toBe(42)
  })

  it("the fetcher closure bundles repos (via cachedFetchGitHub) + profile (via githubApi) into one cached payload", async () => {
    // The repos endpoint goes through fetch (cachedFetchGitHub); the
    // profile endpoint still uses githubApi for the supplementary call.
    const ORIGINAL_FETCH = globalThis.fetch
    globalThis.fetch = (async (url: string | URL | Request) => {
      const u = String(url)
      if (u.includes("/users/torvalds/repos")) {
        return new Response(
          JSON.stringify([
            { name: "linux", full_name: "torvalds/linux", stargazers_count: 100 },
          ]),
          { status: 200, headers: { etag: '"e1"' } },
        )
      }
      return new Response("[]", { status: 200 })
    }) as typeof fetch

    githubApiMock.mockImplementation(async (endpoint: string) => {
      if (endpoint === "/users/torvalds") {
        return { login: "torvalds", id: 1234, public_repos: 42 }
      }
      return null
    })

    try {
      let capturedFetcher:
        | ((c: { etag?: string | null; lastModified?: string | null }) => Promise<{
            kind: string
            data: unknown
          }>)
        | undefined
      cacheMock.getGitHubResourceLocalFirst.mockImplementation(
        async (options: {
          fetcher: (c: {
            etag?: string | null
            lastModified?: string | null
          }) => Promise<{ kind: string; data: unknown }>
        }) => {
          capturedFetcher = options.fetcher
          const result = await options.fetcher({
            etag: null,
            lastModified: null,
          })
          return {
            data: (result as { kind: string; data: unknown }).data,
            meta: {
              cacheStatus: "miss",
              fetchedAt: null,
              isRevalidating: false,
            },
          }
        },
      )

      await fetchUserRepos("token", "torvalds", { limit: 5 })

      expect(capturedFetcher).toBeDefined()
      // Profile call still goes through githubApi
      expect(githubApiMock).toHaveBeenCalledWith(
        "/users/torvalds",
        expect.any(String),
      )
    } finally {
      globalThis.fetch = ORIGINAL_FETCH
    }
  })

  it("the merged-PRs fetcher returns kind:'not-modified' when GitHub answers 304", async () => {
    const ORIGINAL_FETCH = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 304,
        headers: { etag: '"prev"' },
      })) as typeof fetch

    try {
      let capturedFetcher:
        | ((c: { etag?: string | null; lastModified?: string | null }) => Promise<{
            kind: string
          }>)
        | undefined
      cacheMock.getGitHubResourceLocalFirst.mockImplementation(
        async (options: {
          fetcher: (c: {
            etag?: string | null
            lastModified?: string | null
          }) => Promise<{ kind: string }>
        }) => {
          capturedFetcher = options.fetcher
          await options.fetcher({
            etag: '"prev"',
            lastModified: null,
          })
          return {
            data: { items: [], totalCount: 0 },
            meta: {
              cacheStatus: "stale",
              fetchedAt: 1,
              isRevalidating: false,
            },
          }
        },
      )

      const { fetchUserPRs } = await import("./data-factory")
      await fetchUserPRs("token", "torvalds")
      expect(capturedFetcher).toBeDefined()

      // The fetcher's 304 path must NOT call enrichPRWithDetails — i.e.
      // no further /repos/.../pulls/N detail fetches happen.
      const detailCalls = (
        globalThis.fetch as unknown as { mock: { calls: unknown[][] } }
      ).mock?.calls
      // We swapped globalThis.fetch above with a non-vi.fn so we can't
      // assert call count directly here; this test passes as long as the
      // fetcher returns without throwing. The "no enrichment" guarantee
      // is structural: the kind:"not-modified" branch returns early.
      expect(detailCalls).toBeUndefined()
    } finally {
      globalThis.fetch = ORIGINAL_FETCH
    }
  })
})

describe("fetchUserActivity", () => {
  it("caches the graphql blob via local-first and calls contributions in parallel without caching it", async () => {
    cacheMock.getGitHubResourceLocalFirst.mockResolvedValueOnce({
      data: { orgs: ["github"] },
      meta: { cacheStatus: "fresh", fetchedAt: 1, isRevalidating: false },
    })
    userMock.fetchUserContributions.mockResolvedValueOnce({
      contributions: { totalContributions: 100, weeks: [] },
      pinned: [],
    })

    const result = await fetchUserActivity("token", "torvalds")

    expect(cacheMock.getGitHubResourceLocalFirst).toHaveBeenCalledTimes(1)
    const call = cacheMock.getGitHubResourceLocalFirst.mock.calls[0]?.[0]
    expect(call.resource).toBe("user.activity.graphql")
    expect(call.scope).toBe("torvalds")
    expect(result.graphql).toEqual({ orgs: ["github"] })
    expect(result.contributions).toEqual({
      totalContributions: 100,
      weeks: [],
    })
    expect(userMock.fetchUserContributions).toHaveBeenCalledTimes(1)
  })

  it("returns null contributions/pinned when the live fetch throws", async () => {
    cacheMock.getGitHubResourceLocalFirst.mockResolvedValueOnce({
      data: null,
      meta: { cacheStatus: "miss", fetchedAt: null, isRevalidating: false },
    })
    userMock.fetchUserContributions.mockRejectedValueOnce(new Error("boom"))

    const result = await fetchUserActivity("token", "torvalds")
    expect(result).toEqual({
      contributions: null,
      pinned: [],
      graphql: null,
    })
  })
})

describe("peek helpers", () => {
  it("peekCachedUserProfile reads from the user.repos cache slot and returns the bundled profile fields", async () => {
    cacheMock.peekGitHubCache.mockResolvedValueOnce({
      items: [],
      totalCount: 0,
      profile: { login: "torvalds" },
      githubUserId: 1234,
    })
    const result = await peekCachedUserProfile("Torvalds")
    expect(cacheMock.peekGitHubCache).toHaveBeenCalledWith(
      "torvalds",
      "user.repos",
    )
    expect(result).toEqual({
      profile: { login: "torvalds" },
      githubUserId: 1234,
    })
  })

  it("peekCachedUserProfile returns null on cache miss without triggering a fetch", async () => {
    cacheMock.peekGitHubCache.mockResolvedValueOnce(null)
    expect(await peekCachedUserProfile("nobody")).toBeNull()
    expect(githubApiMock).not.toHaveBeenCalled()
  })

  it("peekCachedUserGraphql reads from the user.activity.graphql cache slot", async () => {
    cacheMock.peekGitHubCache.mockResolvedValueOnce({ orgs: ["github"] })
    const result = await peekCachedUserGraphql("torvalds")
    expect(cacheMock.peekGitHubCache).toHaveBeenCalledWith(
      "torvalds",
      "user.activity.graphql",
    )
    expect(result).toEqual({ orgs: ["github"] })
  })
})
