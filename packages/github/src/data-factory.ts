/**
 * GitHub Data Factory — enriched data fetching with cache-engine backing.
 *
 * Unlike the count-only functions in user.ts, this module returns full
 * GitHub objects (PR details, repo info, activity). All caching goes
 * through the shared read-through engine in ./cache so we get conditional
 * refresh, request-scoped dedup, stale-if-rate-limited, adaptive freshness,
 * and webhook-driven invalidation for free.
 *
 * Consumers: AI chat tools, TRPC routers, workflow simulation, future integrations.
 */

import type { CachedPR, CachedRepo } from "@tripwire/db"
import { githubApi } from "./app"
import {
  createGitHubResponseMetadata,
  type GitHubFetchResult,
  getGitHubResourceLocalFirst,
  getOrRevalidateGitHubResource,
  peekGitHubCache,
} from "./cache"
import { cachedFetchGitHub } from "./request"
import type { ContributionsData, GitHubUserGraphQL, PinnedRepo } from "./user"
import { fetchUserContributions, fetchUserGraphQL } from "./user"

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour — matches pre-refactor behavior
const MIN_BATCH_SIZE = 20 // always fetch at least this many for cache warmth

export type { CachedPR as GitHubPR, CachedRepo as GitHubRepoDetail }

export interface FetchOptions {
  limit?: number
  state?: "merged" | "closed" | "open" | "all"
  forceRefresh?: boolean
}

export interface PRResult {
  items: CachedPR[]
  totalCount: number
}

export interface RepoResult {
  items: CachedRepo[]
  totalCount: number
}

export interface ActivityResult {
  contributions: ContributionsData | null
  pinned: PinnedRepo[]
  graphql: GitHubUserGraphQL | null
}

/**
 * Cached PR bundle. Keyed only by the requesting username — `limit` is
 * not part of the cache key so any caller asking for ≤MIN_BATCH_SIZE
 * items hits the same row (matches the pre-refactor optimization).
 */
type MergedPrsCachePayload = {
  items: CachedPR[]
  totalCount: number
}

/**
 * Bundled profile + repos under one cache slot. The profile is fetched
 * as a side-effect of `fetchUserRepos` to get the authoritative
 * `public_repos` count (the repos REST endpoint doesn't return totals).
 * Bundling lets us preserve that single-trip pattern.
 */
type UserReposCachePayload = {
  items: CachedRepo[]
  totalCount: number
  profile: Record<string, unknown> | null
  githubUserId: number | null
}

function transformSearchItemToPR(item: Record<string, unknown>): CachedPR {
  const repoUrl = (item.repository_url as string) ?? ""
  const repoFullName = repoUrl.replace("https://api.github.com/repos/", "")
  const pr = (item.pull_request as Record<string, unknown>) ?? {}
  const user = (item.user as Record<string, unknown>) ?? {}
  const labels = (item.labels as Array<Record<string, unknown>>) ?? []
  const mergedAt = (pr.merged_at as string) ?? null
  const createdAt = (item.created_at as string) ?? ""

  let timeToMergeMinutes: number | null = null
  if (mergedAt && createdAt) {
    timeToMergeMinutes = Math.round(
      (new Date(mergedAt).getTime() - new Date(createdAt).getTime()) / 60_000,
    )
  }

  return {
    title: (item.title as string) ?? "",
    number: (item.number as number) ?? 0,
    htmlUrl: (item.html_url as string) ?? "",
    state: mergedAt ? "merged" : ((item.state as string) ?? "open"),
    createdAt,
    closedAt: (item.closed_at as string) ?? null,
    mergedAt,
    repoFullName,
    labels: labels.map((l) => ({
      name: (l.name as string) ?? "",
      color: (l.color as string) ?? "6E6E6E",
    })),
    authorLogin: (user.login as string) ?? "",
    authorAvatar: (user.avatar_url as string) ?? "",
    additions: 0,
    deletions: 0,
    changedFiles: 0,
    commits: 0,
    timeToMergeMinutes,
    draft: false,
    headSha: null,
    body: null,
    closedBy: null,
    selfClosed: null,
  }
}

/** Fetch full PR detail from the pulls endpoint (has additions/deletions/commits) */
async function enrichPRWithDetails(
  token: string,
  pr: CachedPR,
): Promise<CachedPR> {
  try {
    const [owner, repo] = pr.repoFullName.split("/")
    if (!owner || !repo) return pr
    const detail = await githubApi(
      `/repos/${owner}/${repo}/pulls/${pr.number}`,
      token,
    )
    if (!detail) return pr
    const mergedByUser = (detail.merged_by as Record<string, unknown>) ?? null
    const closedByUser = (detail.closed_by as Record<string, unknown>) ?? null
    const authorLogin =
      ((detail.user as Record<string, unknown>)?.login as string) ??
      pr.authorLogin
    const closerLogin =
      (mergedByUser?.login as string) ?? (closedByUser?.login as string) ?? null

    return {
      ...pr,
      additions: (detail.additions as number) ?? 0,
      deletions: (detail.deletions as number) ?? 0,
      changedFiles: (detail.changed_files as number) ?? 0,
      commits: (detail.commits as number) ?? 0,
      draft: (detail.draft as boolean) ?? false,
      headSha:
        (detail.merge_commit_sha as string) ??
        ((detail.head as Record<string, unknown>)?.sha as string) ??
        null,
      body: ((detail.body as string) ?? "").slice(0, 500) || null,
      closedBy: closerLogin,
      selfClosed: closerLogin
        ? closerLogin.toLowerCase() === authorLogin.toLowerCase()
        : null,
    }
  } catch {
    return pr
  }
}

function transformRepoItem(item: Record<string, unknown>): CachedRepo {
  const license = item.license as Record<string, unknown> | null
  return {
    name: (item.name as string) ?? "",
    fullName: (item.full_name as string) ?? "",
    htmlUrl: (item.html_url as string) ?? "",
    description: (item.description as string) ?? null,
    stars: (item.stargazers_count as number) ?? 0,
    forks: (item.forks_count as number) ?? 0,
    language: (item.language as string) ?? null,
    isFork: (item.fork as boolean) ?? false,
    createdAt: (item.created_at as string) ?? "",
    updatedAt: (item.updated_at as string) ?? "",
    pushedAt: (item.pushed_at as string) ?? null,
    defaultBranch: (item.default_branch as string) ?? null,
    openIssuesCount: (item.open_issues_count as number) ?? 0,
    topics: (item.topics as string[]) ?? [],
    license: (license?.spdx_id as string) ?? null,
    size: (item.size as number) ?? 0,
    archived: (item.archived as boolean) ?? false,
  }
}

function syntheticMetadata() {
  // No raw response headers (yet — the next phase will switch these calls
  // through fetchGitHubResponse so we get ETag + rate-limit headers).
  return createGitHubResponseMetadata(200, {})
}

/**
 * Fetch a user's pull requests with full details.
 * Defaults to 5 merged PRs. Cached for 1 hour.
 */
export async function fetchUserPRs(
  token: string,
  username: string,
  opts: FetchOptions = {},
): Promise<PRResult> {
  const limit = opts.limit ?? 5
  const state = opts.state ?? "merged"
  const scope = username.toLowerCase()

  // Only `merged` state goes through the cache engine — matches pre-refactor behavior.
  if (state !== "merged") {
    return fetchUserPRsRaw(token, username, state, limit)
  }

  const fetcher = async (
    conditionals: { etag?: string | null; lastModified?: string | null },
  ): Promise<GitHubFetchResult<MergedPrsCachePayload>> => {
    const stateFilter = `+is:merged`
    const perPage = Math.max(limit, MIN_BATCH_SIZE)
    const endpoint = `/search/issues?q=author:${encodeURIComponent(username)}+type:pr${stateFilter}&sort=created&order=desc&per_page=${perPage}`

    let result: GitHubFetchResult<{
      total_count?: number
      items?: Record<string, unknown>[]
    }>
    try {
      result = await cachedFetchGitHub(endpoint, conditionals, { token })
    } catch {
      // 422 = user has no searchable PR activity; other errors = transient.
      // Either way, surface an empty result and let the cache hold it briefly.
      return {
        kind: "success",
        data: { items: [], totalCount: 0 },
        metadata: syntheticMetadata(),
      }
    }

    if (result.kind === "not-modified") {
      // Search endpoint unchanged → previously-enriched PRs are still
      // current. Engine refreshes freshness without re-running enrichment.
      return result
    }

    const totalCount = (result.data?.total_count as number) ?? 0
    const rawItems = (result.data?.items as Record<string, unknown>[]) ?? []
    const basePrs = rawItems.map(transformSearchItemToPR)
    const toEnrich = basePrs.slice(0, limit)
    const enriched = await Promise.all(
      toEnrich.map((pr) => enrichPRWithDetails(token, pr)),
    )
    const items = [...enriched, ...basePrs.slice(limit)]
    return {
      kind: "success",
      data: { items, totalCount },
      metadata: result.metadata,
    }
  }
  const engineOpts = {
    scope,
    resource: "user.merged-prs",
    freshForMs: CACHE_TTL_MS,
    fetcher,
  }

  // forceRefresh bypasses local-first so the caller actually waits on fresh data.
  const cached = opts.forceRefresh
    ? await getOrRevalidateGitHubResource<MergedPrsCachePayload>({
        ...engineOpts,
        freshForMs: 0,
      })
    : (
        await getGitHubResourceLocalFirst<MergedPrsCachePayload>(engineOpts)
      ).data

  return {
    items: cached.items.slice(0, limit),
    totalCount: cached.totalCount,
  }
}

async function fetchUserPRsRaw(
  token: string,
  username: string,
  state: "merged" | "closed" | "open" | "all",
  limit: number,
): Promise<PRResult> {
  const stateFilter = state === "all" ? "" : `+is:${state}`
  const perPage = Math.max(limit, MIN_BATCH_SIZE)

  let searchResult: Record<string, unknown> | null = null
  try {
    searchResult = await githubApi(
      `/search/issues?q=author:${encodeURIComponent(username)}+type:pr${stateFilter}&sort=created&order=desc&per_page=${perPage}`,
      token,
    )
  } catch {
    // 422 = user has no searchable PR activity; other errors = API issue.
    return { items: [], totalCount: 0 }
  }

  const totalCount = (searchResult?.total_count as number) ?? 0
  const rawItems = (searchResult?.items as Record<string, unknown>[]) ?? []
  const basePrs = rawItems.map(transformSearchItemToPR)

  // Enrich the ones we'll return with full PR details.
  const toEnrich = basePrs.slice(0, limit)
  const enriched = await Promise.all(
    toEnrich.map((pr) => enrichPRWithDetails(token, pr)),
  )
  const items = [...enriched, ...basePrs.slice(limit)]

  return { items, totalCount }
}

/**
 * Fetch a user's repositories with stars, language, and descriptions.
 * Defaults to 5 top repos by stars. Cached for 1 hour. Profile is
 * bundled into the same cache slot since it's fetched together to
 * resolve the authoritative `public_repos` count.
 */
export async function fetchUserRepos(
  token: string,
  username: string,
  opts: FetchOptions = {},
): Promise<RepoResult> {
  const limit = opts.limit ?? 5
  const scope = username.toLowerCase()

  const fetcher = async (
    conditionals: { etag?: string | null; lastModified?: string | null },
  ): Promise<GitHubFetchResult<UserReposCachePayload>> => {
    const perPage = Math.max(limit, MIN_BATCH_SIZE)
    const reposEndpoint = `/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&sort=stargazers&direction=desc`

    const reposResult = await cachedFetchGitHub<Record<string, unknown>[]>(
      reposEndpoint,
      conditionals,
      { token },
    )

    if (reposResult.kind === "not-modified") {
      // Repos list unchanged → existing bundled profile/id are still valid.
      return reposResult
    }

    const rawItems = reposResult.data ?? []
    const items = rawItems.map(transformRepoItem)
    let totalCount = items.length
    let profile: Record<string, unknown> | null = null
    let githubUserId: number | null = null

    try {
      // Profile is supplementary — no conditional refresh (rate-limit
      // headers come from the repos call, which is what feeds adaptive freshness).
      profile = await githubApi(
        `/users/${encodeURIComponent(username)}`,
        token,
      )
      if (profile?.public_repos) {
        totalCount = profile.public_repos as number
      }
      if (typeof profile?.id === "number") {
        githubUserId = profile.id
      }
    } catch {
      // Profile fetch is best-effort — keep raw repo count.
    }

    return {
      kind: "success",
      data: { items, totalCount, profile, githubUserId },
      metadata: reposResult.metadata,
    }
  }
  const engineOpts = {
    scope,
    resource: "user.repos",
    freshForMs: CACHE_TTL_MS,
    fetcher,
  }
  const cached = opts.forceRefresh
    ? await getOrRevalidateGitHubResource<UserReposCachePayload>({
        ...engineOpts,
        freshForMs: 0,
      })
    : (
        await getGitHubResourceLocalFirst<UserReposCachePayload>(engineOpts)
      ).data

  return {
    items: cached.items.slice(0, limit),
    totalCount: cached.totalCount,
  }
}

/**
 * Fetch a user's contribution activity: calendar, pinned repos, enriched profile.
 * The graphql blob (orgs/sponsors/badges) is cached for 1 hour; the
 * contributions calendar and pinned repos are always fetched fresh
 * since they change daily.
 */
export async function fetchUserActivity(
  token: string,
  username: string,
  opts: Pick<FetchOptions, "forceRefresh"> = {},
): Promise<ActivityResult> {
  const scope = username.toLowerCase()

  const graphqlFetcher = async () => {
    const data = await fetchUserGraphQL(token, username).catch(() => null)
    return { kind: "success" as const, data, metadata: syntheticMetadata() }
  }
  const graphqlEngineOpts = {
    scope,
    resource: "user.activity.graphql",
    freshForMs: CACHE_TTL_MS,
    fetcher: graphqlFetcher,
  }
  const [graphql, contribs] = await Promise.all([
    opts.forceRefresh
      ? getOrRevalidateGitHubResource<GitHubUserGraphQL | null>({
          ...graphqlEngineOpts,
          freshForMs: 0,
        })
      : getGitHubResourceLocalFirst<GitHubUserGraphQL | null>(
          graphqlEngineOpts,
        ).then((r) => r.data),
    fetchUserContributions(token, username).catch(() => null),
  ])

  return {
    contributions: contribs?.contributions ?? null,
    pinned: contribs?.pinned ?? [],
    graphql,
  }
}

/**
 * Opportunistic read of a user's cached profile (if anyone has fetched
 * their repos before). Returns null on cache miss — does NOT trigger a
 * GitHub fetch. Used by the custom-rules simulator to render previews
 * for usernames seen in the event log.
 */
export async function peekCachedUserProfile(
  username: string,
): Promise<{
  profile: Record<string, unknown> | null
  githubUserId: number | null
} | null> {
  const cached = await peekGitHubCache<UserReposCachePayload>(
    username.toLowerCase(),
    "user.repos",
  )
  if (!cached) return null
  return { profile: cached.profile, githubUserId: cached.githubUserId }
}

/**
 * Opportunistic read of a user's cached graphql enrichment. Returns null
 * on cache miss — does NOT trigger a GitHub fetch.
 */
export async function peekCachedUserGraphql(
  username: string,
): Promise<GitHubUserGraphQL | null> {
  return peekGitHubCache<GitHubUserGraphQL>(
    username.toLowerCase(),
    "user.activity.graphql",
  )
}

// ---------------------------------------------------------------------------
// Comment + PR detail helpers (no caching — these are per-comment-thread
// reads triggered only by deep-dive UI / AI tool calls).
// ---------------------------------------------------------------------------

export interface PRComment {
  id: number
  author: string
  authorAvatar: string
  body: string
  createdAt: string
  type: "comment" | "review"
}

export interface CommentThreadResult {
  comments: PRComment[]
  totalCount: number
}

/**
 * Bot detection — uses the GitHub user `type` field (authoritative) plus
 * a pattern fallback for older accounts that don't set type correctly.
 */
const BOT_LOGIN_PATTERNS = [
  /\[bot\]$/i,
  /bot$/i,
  /-bot$/i,
  /^github-actions/i,
]

function isBot(login: string, userType?: string): boolean {
  if (userType === "Bot") return true
  return BOT_LOGIN_PATTERNS.some((p) => p.test(login))
}

/**
 * Fetch comments on any issue or PR. Merges conversation comments and
 * review comments (for PRs), filters bots, sorts chronologically.
 */
export async function fetchComments(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  opts: { limit?: number; includeBots?: boolean } = {},
): Promise<CommentThreadResult> {
  const limit = opts.limit ?? 50

  const [issueComments, reviewComments] = await Promise.all([
    githubApi(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
      token,
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${issueNumber}/comments?per_page=100`,
      token,
    ).catch(() => []),
  ])

  const all: PRComment[] = []

  for (const c of (issueComments as Array<Record<string, unknown>>) ?? []) {
    const u = (c.user as Record<string, unknown>) ?? {}
    const login = (u.login as string) ?? ""
    if (!login) continue
    if (!opts.includeBots && isBot(login, (u.type as string) ?? "")) continue
    const body = ((c.body as string) ?? "").trim()
    if (!body) continue
    all.push({
      id: (c.id as number) ?? 0,
      author: login,
      authorAvatar: (u.avatar_url as string) ?? "",
      body: body.slice(0, 3000),
      createdAt: (c.created_at as string) ?? "",
      type: "comment",
    })
  }

  for (const c of (reviewComments as Array<Record<string, unknown>>) ?? []) {
    const u = (c.user as Record<string, unknown>) ?? {}
    const login = (u.login as string) ?? ""
    if (!login) continue
    if (!opts.includeBots && isBot(login, (u.type as string) ?? "")) continue
    const body = ((c.body as string) ?? "").trim()
    if (!body) continue
    all.push({
      id: (c.id as number) ?? 0,
      author: login,
      authorAvatar: (u.avatar_url as string) ?? "",
      body: body.slice(0, 3000),
      createdAt: (c.created_at as string) ?? "",
      type: "review",
    })
  }

  const seenIds = new Set<number>()
  const sorted = all
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .filter((c) => {
      if (seenIds.has(c.id)) return false
      seenIds.add(c.id)
      return true
    })

  return { comments: sorted.slice(0, limit), totalCount: sorted.length }
}

export interface PRDetailResult {
  pr: CachedPR
  files: Array<{
    filename: string
    status: string
    additions: number
    deletions: number
    changes: number
  }>
  reviewers: Array<{ login: string; state: string; avatarUrl: string }>
  commitMessages: string[]
  comments: PRComment[]
}

/**
 * Fetch full details for a single PR: diff stats, file list, reviewers, commits.
 */
export async function fetchPRDetail(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
): Promise<PRDetailResult> {
  const [
    prData,
    filesData,
    reviewsData,
    commitsData,
    issueComments,
    reviewComments,
  ] = await Promise.all([
    githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`, token),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${prNumber}/files?per_page=100`,
      token,
    ).catch(() => []),
    githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, token).catch(
      () => [],
    ),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`,
      token,
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
      token,
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`,
      token,
    ).catch(() => []),
  ])

  if (!prData) throw new Error(`PR #${prNumber} not found in ${owner}/${repo}`)

  const user = (prData.user as Record<string, unknown>) ?? {}
  const labels = (prData.labels as Array<Record<string, unknown>>) ?? []
  const mergedAt = (prData.merged_at as string) ?? null
  const createdAt = (prData.created_at as string) ?? ""

  let timeToMergeMinutes: number | null = null
  if (mergedAt && createdAt) {
    timeToMergeMinutes = Math.round(
      (new Date(mergedAt).getTime() - new Date(createdAt).getTime()) / 60_000,
    )
  }

  const mergedByUser = (prData.merged_by as Record<string, unknown>) ?? null
  const closedByUser = (prData.closed_by as Record<string, unknown>) ?? null
  const authorLogin = (user.login as string) ?? ""
  const closerLogin =
    (mergedByUser?.login as string) ?? (closedByUser?.login as string) ?? null

  const pr: CachedPR = {
    title: (prData.title as string) ?? "",
    number: prNumber,
    htmlUrl: (prData.html_url as string) ?? "",
    state: mergedAt ? "merged" : ((prData.state as string) ?? "open"),
    createdAt,
    closedAt: (prData.closed_at as string) ?? null,
    mergedAt,
    repoFullName: `${owner}/${repo}`,
    labels: labels.map((l) => ({
      name: (l.name as string) ?? "",
      color: (l.color as string) ?? "6E6E6E",
    })),
    authorLogin,
    authorAvatar: (user.avatar_url as string) ?? "",
    additions: (prData.additions as number) ?? 0,
    deletions: (prData.deletions as number) ?? 0,
    changedFiles: (prData.changed_files as number) ?? 0,
    commits: (prData.commits as number) ?? 0,
    timeToMergeMinutes,
    draft: (prData.draft as boolean) ?? false,
    headSha: (prData.merge_commit_sha as string) ?? null,
    body: ((prData.body as string) ?? "").slice(0, 1000) || null,
    closedBy: closerLogin,
    selfClosed: closerLogin
      ? closerLogin.toLowerCase() === authorLogin.toLowerCase()
      : null,
  }

  const files = ((filesData as Array<Record<string, unknown>>) ?? []).map(
    (f) => ({
      filename: (f.filename as string) ?? "",
      status: (f.status as string) ?? "modified",
      additions: (f.additions as number) ?? 0,
      deletions: (f.deletions as number) ?? 0,
      changes: (f.changes as number) ?? 0,
    }),
  )

  const reviewerMap = new Map<
    string,
    { login: string; state: string; avatarUrl: string }
  >()
  for (const r of (reviewsData as Array<Record<string, unknown>>) ?? []) {
    const rUser = (r.user as Record<string, unknown>) ?? {}
    const login = (rUser.login as string) ?? ""
    if (login) {
      reviewerMap.set(login, {
        login,
        state: (r.state as string) ?? "PENDING",
        avatarUrl: (rUser.avatar_url as string) ?? "",
      })
    }
  }

  const commitMessages = ((commitsData as Array<Record<string, unknown>>) ?? [])
    .map((c) => {
      const commit = (c.commit as Record<string, unknown>) ?? {}
      return (commit.message as string) ?? ""
    })
    .filter(Boolean)
    .map((m) => m.split("\n")[0])

  const allComments: PRComment[] = []

  for (const c of (issueComments as Array<Record<string, unknown>>) ?? []) {
    const cUser = (c.user as Record<string, unknown>) ?? {}
    const login = (cUser.login as string) ?? ""
    const userType = (cUser.type as string) ?? ""
    if (!login || isBot(login, userType)) continue
    const body = ((c.body as string) ?? "").trim()
    if (!body) continue
    allComments.push({
      id: (c.id as number) ?? 0,
      author: login,
      authorAvatar: (cUser.avatar_url as string) ?? "",
      body: body.slice(0, 2000),
      createdAt: (c.created_at as string) ?? "",
      type: "comment",
    })
  }

  for (const c of (reviewComments as Array<Record<string, unknown>>) ?? []) {
    const cUser = (c.user as Record<string, unknown>) ?? {}
    const login = (cUser.login as string) ?? ""
    const userType = (cUser.type as string) ?? ""
    if (!login || isBot(login, userType)) continue
    const body = ((c.body as string) ?? "").trim()
    if (!body) continue
    allComments.push({
      id: (c.id as number) ?? 0,
      author: login,
      authorAvatar: (cUser.avatar_url as string) ?? "",
      body: body.slice(0, 2000),
      createdAt: (c.created_at as string) ?? "",
      type: "review",
    })
  }

  const seenIds = new Set<number>()
  const comments = allComments
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    )
    .filter((c) => {
      if (seenIds.has(c.id)) return false
      seenIds.add(c.id)
      return true
    })

  return {
    pr,
    files,
    reviewers: Array.from(reviewerMap.values()),
    commitMessages,
    comments,
  }
}
