/**
 * Request policy helpers for GitHub fetches. Tripwire uses raw `fetch`
 * rather than Octokit, so this module is the functional equivalent of
 * diffkit's `github-request-policy.ts` — composable timeout + abort
 * signal, conditional-refresh headers for the cache engine, and a
 * structured rate-limit log line per response.
 */

import { createLogger, LogLevel } from "@tripwire/logger"

// `GITHUB_RATE_LIMIT_DEBUG=1` is the gate; the logger itself stays enabled
// in every NODE_ENV (including test) so the gate alone decides.
const logger = createLogger("github-rate-limit", {
  enabled: true,
  logLevel: LogLevel.DEBUG,
})

export const GITHUB_REQUEST_TIMEOUT_MS = 12_000

export type GitHubConditionals = {
  etag?: string | null
  lastModified?: string | null
}

/**
 * Compose a timeout signal with the caller's signal (if any). Both are
 * honored — the request aborts on whichever fires first.
 */
export function createGitHubRequestSignal(
  callerSignal?: AbortSignal,
  timeoutMs: number = GITHUB_REQUEST_TIMEOUT_MS
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs)
  if (!callerSignal) return timeoutSignal
  return AbortSignal.any([callerSignal, timeoutSignal])
}

/**
 * Build the conditional-refresh headers a cached read should send so
 * GitHub can answer 304 when the resource hasn't changed.
 */
export function buildConditionalHeaders(
  conditionals: GitHubConditionals
): Record<string, string> {
  const headers: Record<string, string> = {}
  if (conditionals.etag) headers["if-none-match"] = conditionals.etag
  if (conditionals.lastModified) {
    headers["if-modified-since"] = conditionals.lastModified
  }
  return headers
}

/**
 * Read the canonical rate-limit headers off a GitHub response. Used by
 * the cache engine to drive adaptive freshness, and by the rate-limit
 * logger for observability.
 */
export function parseGitHubRateLimitHeaders(headers: Headers): {
  limit: number | null
  remaining: number | null
  used: number | null
  resetAt: string | null
  resource: string | null
} {
  function asNumber(value: string | null): number | null {
    if (!value) return null
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? parsed : null
  }

  const reset = asNumber(headers.get("x-ratelimit-reset"))
  return {
    limit: asNumber(headers.get("x-ratelimit-limit")),
    remaining: asNumber(headers.get("x-ratelimit-remaining")),
    used: asNumber(headers.get("x-ratelimit-used")),
    resetAt: reset !== null ? new Date(reset * 1000).toISOString() : null,
    resource: headers.get("x-ratelimit-resource"),
  }
}

/**
 * Lightweight observability hook. Stays cheap when the env var is unset.
 * Token label is non-secret — it identifies which bucket was charged
 * (e.g. `installation:42`), never the token itself.
 */
export function logGitHubRateLimit({
  tokenLabel,
  method,
  url,
  status,
  headers,
}: {
  tokenLabel: string
  method: string
  url: string
  status: number
  headers: Headers
}) {
  if (process.env.GITHUB_RATE_LIMIT_DEBUG !== "1") return
  const rate = parseGitHubRateLimitHeaders(headers)
  if (
    rate.remaining === null &&
    rate.limit === null &&
    rate.used === null &&
    rate.resetAt === null
  ) {
    return
  }
  logger.debug("rate limit headers", {
    token: tokenLabel,
    method,
    url,
    status,
    ...rate,
  })
}

export type GitHubResponseEnvelope<TData> = {
  data: TData
  headers: Headers
  status: number
}

export type GitHubFetchOptions = {
  token: string
  tokenLabel?: string
  method?: string
  body?: BodyInit | null
  /** Caller's abort signal — composed with the 12s timeout. */
  signal?: AbortSignal
  /** Headers to include for conditional refresh (ETag / If-Modified-Since). */
  conditionals?: GitHubConditionals
  /** Extra headers (caller-supplied). */
  headers?: Record<string, string>
  /** Defaults to https://api.github.com. */
  baseUrl?: string
}

/**
 * Thin fetch wrapper that returns the full response envelope (data +
 * headers + status). Returns `null` data on 304 so the cache engine can
 * detect "not modified" without inspecting the body.
 *
 * The caller is responsible for translating non-OK statuses into the
 * shape the cache engine expects (it inspects `error.status` +
 * `error.response.headers`); throw a structured error or surface the
 * envelope directly per resource.
 */
export async function fetchGitHubResponse<TData = unknown>(
  endpoint: string,
  options: GitHubFetchOptions
): Promise<GitHubResponseEnvelope<TData | null>> {
  const {
    token,
    tokenLabel = "github",
    method = "GET",
    body,
    signal,
    conditionals,
    headers: extraHeaders,
    baseUrl = "https://api.github.com",
  } = options

  const url = endpoint.startsWith("http") ? endpoint : `${baseUrl}${endpoint}`
  const composedSignal = createGitHubRequestSignal(signal)

  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...buildConditionalHeaders(conditionals ?? {}),
    ...extraHeaders,
  }

  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body,
    signal: composedSignal,
  })

  logGitHubRateLimit({
    tokenLabel,
    method,
    url,
    status: response.status,
    headers: response.headers,
  })

  // 304 has no body — caller maps to {kind: "not-modified"}.
  if (response.status === 304) {
    return { data: null, headers: response.headers, status: 304 }
  }

  const text = await response.text()
  const data = text.length > 0 ? (JSON.parse(text) as TData) : (null as TData)
  return { data, headers: response.headers, status: response.status }
}

import {
  createGitHubResponseMetadata,
  type GitHubFetchResult,
} from "./response-metadata"

/**
 * Cache-engine-shaped wrapper around `fetchGitHubResponse`. Translates
 * a GitHub response into the discriminated union the engine's `fetcher`
 * callback returns: 304 → not-modified, 2xx → success, other 4xx/5xx →
 * throws an error with `{status, response: {headers}}` so the engine's
 * rate-limit/forbidden detection paths work.
 *
 * Pass this (curried) as the engine's fetcher to get real conditional
 * refresh + rate-limit metadata.
 */
export async function cachedFetchGitHub<TData>(
  endpoint: string,
  conditionals: GitHubConditionals,
  options: Omit<GitHubFetchOptions, "conditionals">
): Promise<GitHubFetchResult<TData>> {
  const envelope = await fetchGitHubResponse<TData>(endpoint, {
    ...options,
    conditionals,
  })

  const headers = headersToRecord(envelope.headers)
  const metadata = createGitHubResponseMetadata(envelope.status, headers)

  if (envelope.status === 304) {
    return { kind: "not-modified", metadata }
  }

  if (envelope.status >= 200 && envelope.status < 300) {
    return {
      kind: "success",
      data: envelope.data as TData,
      metadata,
    }
  }

  // Throw a shape the cache engine's rate-limit + forbidden checks
  // recognize (`error.status` + `error.response.headers`).
  throw {
    status: envelope.status,
    message: `GitHub API ${envelope.status}`,
    response: { headers },
  }
}

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {}
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value
  })
  return out
}
