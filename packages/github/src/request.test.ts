import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  buildConditionalHeaders,
  cachedFetchGitHub,
  createGitHubRequestSignal,
  fetchGitHubResponse,
  GITHUB_REQUEST_TIMEOUT_MS,
  logGitHubRateLimit,
  parseGitHubRateLimitHeaders,
} from "./request"

describe("buildConditionalHeaders", () => {
  it("includes both etag and last-modified when present", () => {
    expect(
      buildConditionalHeaders({
        etag: '"abc"',
        lastModified: "Tue, 01 Apr 2025 10:00:00 GMT",
      }),
    ).toEqual({
      "if-none-match": '"abc"',
      "if-modified-since": "Tue, 01 Apr 2025 10:00:00 GMT",
    })
  })

  it("omits each header when its value is null/undefined", () => {
    expect(buildConditionalHeaders({ etag: '"abc"' })).toEqual({
      "if-none-match": '"abc"',
    })
    expect(buildConditionalHeaders({ lastModified: "x" })).toEqual({
      "if-modified-since": "x",
    })
    expect(buildConditionalHeaders({})).toEqual({})
  })
})

describe("createGitHubRequestSignal", () => {
  it("returns a signal that is not aborted when the timeout has not fired yet", () => {
    const signal = createGitHubRequestSignal()
    expect(signal.aborted).toBe(false)
  })

  it("composes with a caller signal — aborting the caller aborts the composed signal", () => {
    const controller = new AbortController()
    const composed = createGitHubRequestSignal(controller.signal)
    expect(composed.aborted).toBe(false)
    controller.abort()
    expect(composed.aborted).toBe(true)
  })

  it("exposes the default 12s timeout constant", () => {
    expect(GITHUB_REQUEST_TIMEOUT_MS).toBe(12_000)
  })
})

describe("parseGitHubRateLimitHeaders", () => {
  it("parses the canonical rate-limit headers into numbers + ISO reset time", () => {
    const headers = new Headers({
      "x-ratelimit-limit": "5000",
      "x-ratelimit-remaining": "4988",
      "x-ratelimit-used": "12",
      "x-ratelimit-reset": "1712487600",
      "x-ratelimit-resource": "core",
    })
    expect(parseGitHubRateLimitHeaders(headers)).toEqual({
      limit: 5000,
      remaining: 4988,
      used: 12,
      resetAt: new Date(1712487600 * 1000).toISOString(),
      resource: "core",
    })
  })

  it("returns null fields when headers are missing or malformed", () => {
    expect(parseGitHubRateLimitHeaders(new Headers())).toEqual({
      limit: null,
      remaining: null,
      used: null,
      resetAt: null,
      resource: null,
    })
    expect(
      parseGitHubRateLimitHeaders(
        new Headers({ "x-ratelimit-remaining": "notanumber" }),
      ).remaining,
    ).toBeNull()
  })
})

describe("logGitHubRateLimit", () => {
  const ORIGINAL_DEBUG = process.env.GITHUB_RATE_LIMIT_DEBUG
  beforeEach(() => {
    process.env.GITHUB_RATE_LIMIT_DEBUG = "1"
  })
  afterEach(() => {
    if (ORIGINAL_DEBUG === undefined) {
      delete process.env.GITHUB_RATE_LIMIT_DEBUG
    } else {
      process.env.GITHUB_RATE_LIMIT_DEBUG = ORIGINAL_DEBUG
    }
  })

  it("emits a structured log when the debug flag is on and rate-limit headers exist", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    logGitHubRateLimit({
      tokenLabel: "installation:42",
      method: "GET",
      url: "https://api.github.com/users/torvalds",
      status: 200,
      headers: new Headers({
        "x-ratelimit-limit": "5000",
        "x-ratelimit-remaining": "4500",
      }),
    })
    expect(log).toHaveBeenCalledWith(
      "[github-rate-limit]",
      expect.objectContaining({
        token: "installation:42",
        method: "GET",
        status: 200,
        limit: 5000,
        remaining: 4500,
      }),
    )
    log.mockRestore()
  })

  it("does not log when no rate-limit headers are present", () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    logGitHubRateLimit({
      tokenLabel: "installation:42",
      method: "GET",
      url: "https://api.github.com/users/torvalds",
      status: 200,
      headers: new Headers(),
    })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })

  it("does not log when the debug env var is off", () => {
    delete process.env.GITHUB_RATE_LIMIT_DEBUG
    const log = vi.spyOn(console, "log").mockImplementation(() => {})
    logGitHubRateLimit({
      tokenLabel: "installation:42",
      method: "GET",
      url: "https://api.github.com/users/torvalds",
      status: 200,
      headers: new Headers({ "x-ratelimit-remaining": "100" }),
    })
    expect(log).not.toHaveBeenCalled()
    log.mockRestore()
  })
})

describe("fetchGitHubResponse", () => {
  const ORIGINAL_FETCH = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it("includes auth + version + conditional headers and returns the parsed envelope", async () => {
    const captured: { url: string; init: RequestInit | undefined } = {
      url: "",
      init: undefined,
    }
    globalThis.fetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      captured.url = String(url)
      captured.init = init
      return new Response(JSON.stringify({ login: "torvalds" }), {
        status: 200,
        headers: { etag: '"e1"' },
      })
    }) as typeof fetch

    const envelope = await fetchGitHubResponse<{ login: string }>(
      "/users/torvalds",
      {
        token: "ghp_test",
        conditionals: { etag: '"prev"' },
      },
    )

    expect(captured.url).toBe("https://api.github.com/users/torvalds")
    const headers = captured.init?.headers as Record<string, string>
    expect(headers.Authorization).toBe("Bearer ghp_test")
    expect(headers.Accept).toBe("application/vnd.github+json")
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28")
    expect(headers["if-none-match"]).toBe('"prev"')
    expect(envelope.status).toBe(200)
    expect(envelope.data).toEqual({ login: "torvalds" })
    expect(envelope.headers.get("etag")).toBe('"e1"')
  })

  it("returns null data with status 304 when GitHub says not-modified", async () => {
    globalThis.fetch = (async () =>
      new Response(null, { status: 304 })) as typeof fetch

    const envelope = await fetchGitHubResponse("/users/torvalds", {
      token: "ghp_test",
    })
    expect(envelope.status).toBe(304)
    expect(envelope.data).toBeNull()
  })

  it("threads an external endpoint URL through without prepending the base", async () => {
    let calledUrl = ""
    globalThis.fetch = (async (url: string | URL | Request) => {
      calledUrl = String(url)
      return new Response("{}", { status: 200 })
    }) as typeof fetch

    await fetchGitHubResponse("https://api.example.com/elsewhere", {
      token: "x",
    })
    expect(calledUrl).toBe("https://api.example.com/elsewhere")
  })
})

describe("cachedFetchGitHub", () => {
  const ORIGINAL_FETCH = globalThis.fetch
  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
  })

  it("returns {kind:'success', data, metadata} with real headers on 2xx", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ login: "torvalds" }), {
        status: 200,
        headers: {
          etag: '"e1"',
          "last-modified": "Tue, 01 Apr 2025 10:00:00 GMT",
          "x-ratelimit-remaining": "4999",
          "x-ratelimit-reset": "1712487600",
        },
      })) as typeof fetch

    const result = await cachedFetchGitHub<{ login: string }>(
      "/users/torvalds",
      {},
      { token: "ghp_test" },
    )

    expect(result.kind).toBe("success")
    if (result.kind === "success") {
      expect(result.data).toEqual({ login: "torvalds" })
      expect(result.metadata.etag).toBe('"e1"')
      expect(result.metadata.lastModified).toBe(
        "Tue, 01 Apr 2025 10:00:00 GMT",
      )
      expect(result.metadata.rateLimitRemaining).toBe(4999)
      expect(result.metadata.rateLimitReset).toBe(1712487600)
      expect(result.metadata.statusCode).toBe(200)
    }
  })

  it("returns {kind:'not-modified', metadata} on 304", async () => {
    globalThis.fetch = (async () =>
      new Response(null, {
        status: 304,
        headers: { etag: '"e1"' },
      })) as typeof fetch

    const result = await cachedFetchGitHub(
      "/users/torvalds",
      { etag: '"e1"' },
      { token: "ghp_test" },
    )

    expect(result.kind).toBe("not-modified")
    if (result.kind === "not-modified") {
      expect(result.metadata.etag).toBe('"e1"')
      expect(result.metadata.statusCode).toBe(304)
    }
  })

  it("throws a {status, response:{headers}}-shaped error on 4xx so the engine can detect rate-limit/forbidden", async () => {
    globalThis.fetch = (async () =>
      new Response("{}", {
        status: 403,
        headers: {
          "x-ratelimit-remaining": "0",
          "x-ratelimit-reset": "1712487600",
          "retry-after": "60",
        },
      })) as typeof fetch

    let caught: unknown = null
    try {
      await cachedFetchGitHub("/users/torvalds", {}, { token: "ghp_test" })
    } catch (err) {
      caught = err
    }
    expect(caught).toMatchObject({
      status: 403,
      response: {
        headers: expect.objectContaining({
          "x-ratelimit-remaining": "0",
          "retry-after": "60",
        }),
      },
    })
  })

  it("threads conditionals through to fetchGitHubResponse as if-none-match / if-modified-since", async () => {
    let capturedHeaders: Record<string, string> = {}
    globalThis.fetch = (async (
      _url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedHeaders = (init?.headers as Record<string, string>) ?? {}
      return new Response("{}", { status: 200 })
    }) as typeof fetch

    await cachedFetchGitHub(
      "/users/torvalds",
      { etag: '"prev"', lastModified: "Mon" },
      { token: "ghp_test" },
    )

    expect(capturedHeaders["if-none-match"]).toBe('"prev"')
    expect(capturedHeaders["if-modified-since"]).toBe("Mon")
  })
})
