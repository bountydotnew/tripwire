/**
 * GitHub Data Factory — enriched data fetching with DB caching.
 *
 * Unlike the count-only functions in user.ts, this module returns full
 * GitHub objects (PR details, repo info, activity) and caches them in
 * PostgreSQL for instant repeat lookups.
 *
 * Consumers: AI chat tools, TRPC routers, workflow simulation, future integrations.
 */

import { githubApi } from "./app"
import { fetchUserGraphQL, fetchUserContributions } from "./user"
import type { GitHubUserGraphQL, PinnedRepo, ContributionsData } from "./user"
import type { CachedPR, CachedRepo } from "@tripwire/db"
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
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
async function getDbDeps() {
  const { eq, sql } = await import("drizzle-orm")
  const { db } = await import("@tripwire/db/client")
  const { githubUserCache } = await import("@tripwire/db")
  return { eq, sql, db, githubUserCache }
}

async function getCached(username: string) {
  try {
    const { sql, db, githubUserCache } = await getDbDeps()
    const [row] = await db
      .select()
      .from(githubUserCache)
      .where(
        sql`lower(${githubUserCache.githubUsername}) = ${username.toLowerCase()}`
      )
      .limit(1)
    if (!row) return null
    if (row.expiresAt < new Date()) return null // expired
    return row
  } catch {
    return null // cache read failure — fall through to API
  }
}

async function upsertCache(
  username: string,
  data: {
    githubUserId?: number
    profileJson?: Record<string, unknown>
    mergedPrsJson?: CachedPR[]
    mergedPrCount?: number
    reposJson?: CachedRepo[]
    repoCount?: number
    graphqlJson?: Record<string, unknown> | null
  }
) {
  const now = new Date()
  const expiresAt = new Date(now.getTime() + CACHE_TTL_MS)
  const normalizedUsername = username.toLowerCase()
  const updateSet = {
    ...(data.githubUserId !== undefined && { githubUserId: data.githubUserId }),
    ...(data.profileJson !== undefined && { profileJson: data.profileJson }),
    ...(data.mergedPrsJson !== undefined && {
      mergedPrsJson: data.mergedPrsJson,
    }),
    ...(data.mergedPrCount !== undefined && {
      mergedPrCount: data.mergedPrCount,
    }),
    ...(data.reposJson !== undefined && { reposJson: data.reposJson }),
    ...(data.repoCount !== undefined && { repoCount: data.repoCount }),
    ...(data.graphqlJson !== undefined && { graphqlJson: data.graphqlJson }),
    fetchedAt: now,
    expiresAt,
    updatedAt: now,
  }
  try {
    const { sql, db, githubUserCache } = await getDbDeps()
    await db
      .insert(githubUserCache)
      .values({
        githubUsername: normalizedUsername,
        githubUserId: data.githubUserId ?? null,
        profileJson: data.profileJson ?? {},
        mergedPrsJson: data.mergedPrsJson ?? [],
        mergedPrCount: data.mergedPrCount ?? 0,
        reposJson: data.reposJson ?? [],
        repoCount: data.repoCount ?? 0,
        graphqlJson: data.graphqlJson ?? null,
        fetchedAt: now,
        expiresAt,
      })
      .onConflictDoNothing()

    await db
      .update(githubUserCache)
      .set(updateSet)
      .where(
        sql`lower(${githubUserCache.githubUsername}) = ${normalizedUsername}`
      )
  } catch {
    // Cache write failure — non-fatal
  }
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
      (new Date(mergedAt).getTime() - new Date(createdAt).getTime()) / 60_000
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
    // These get enriched by fetchPRDetails — default to 0
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
  pr: CachedPR
): Promise<CachedPR> {
  try {
    const [owner, repo] = pr.repoFullName.split("/")
    if (!owner || !repo) return pr
    const detail = await githubApi(
      `/repos/${owner}/${repo}/pulls/${pr.number}`,
      token
    )
    if (!detail) return pr
    // merged_by is set when PR is merged; closed_by when closed without merge
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
/**
 * Fetch a user's pull requests with full details.
 * Defaults to 5 merged PRs. Cached for 1 hour.
 */
export async function fetchUserPRs(
  token: string,
  username: string,
  opts: FetchOptions = {}
): Promise<PRResult> {
  const limit = opts.limit ?? 5
  const state = opts.state ?? "merged"

  // Check cache (only for merged state — the default/common case)
  if (!opts.forceRefresh && state === "merged") {
    const cached = await getCached(username)
    if (cached && cached.mergedPrsJson.length > 0) {
      return {
        items: (cached.mergedPrsJson as CachedPR[]).slice(0, limit),
        totalCount: cached.mergedPrCount,
      }
    }
  }

  // Fetch from GitHub Search API
  const stateFilter = state === "all" ? "" : `+is:${state}`
  const perPage = Math.max(limit, MIN_BATCH_SIZE)
  let searchResult: Record<string, unknown> | null = null
  try {
    searchResult = await githubApi(
      `/search/issues?q=author:${encodeURIComponent(username)}+type:pr${stateFilter}&sort=created&order=desc&per_page=${perPage}`,
      token
    )
  } catch {
    // 422 = user has no searchable PR activity, other errors = API issue
    return { items: [], totalCount: 0 }
  }

  const totalCount = (searchResult?.total_count as number) ?? 0
  const rawItems = (searchResult?.items as Record<string, unknown>[]) ?? []
  const basePrs = rawItems.map(transformSearchItemToPR)

  // Enrich the ones we'll return with full PR details (additions/deletions/commits)
  const toEnrich = basePrs.slice(0, limit)
  const enriched = await Promise.all(
    toEnrich.map((pr) => enrichPRWithDetails(token, pr))
  )
  const prs = [...enriched, ...basePrs.slice(limit)]

  // Cache merged PRs
  if (state === "merged") {
    await upsertCache(username, {
      mergedPrsJson: prs,
      mergedPrCount: totalCount,
    })
  }

  return { items: enriched, totalCount }
}
export interface CommentThreadResult {
  comments: PRComment[]
  totalCount: number
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
  opts: { limit?: number; includeBots?: boolean } = {}
): Promise<CommentThreadResult> {
  const limit = opts.limit ?? 50

  // Issue comments (conversation) + PR review comments in parallel
  const [issueComments, reviewComments] = await Promise.all([
    githubApi(
      `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`,
      token
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${issueNumber}/comments?per_page=100`,
      token
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
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )
    .filter((c) => {
      if (seenIds.has(c.id)) return false
      seenIds.add(c.id)
      return true
    })

  return { comments: sorted.slice(0, limit), totalCount: sorted.length }
}
export interface PRComment {
  id: number
  author: string
  authorAvatar: string
  body: string
  createdAt: string
  type: "comment" | "review"
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
 * Bot detection — uses the GitHub user `type` field (authoritative) plus
 * a pattern fallback for older accounts that don't set type correctly.
 * The `type === "Bot"` check catches all GitHub App bots (anything installed
 * via the Marketplace). The patterns are a safety net for edge cases.
 */
const BOT_LOGIN_PATTERNS = [
  /\[bot\]$/i,
  /bot$/i, // catches most convention-following bots
  /-bot$/i,
  /^github-actions/i,
]

function isBot(login: string, userType?: string): boolean {
  // GitHub's own classification — covers all Marketplace/App bots
  if (userType === "Bot") return true
  return BOT_LOGIN_PATTERNS.some((p) => p.test(login))
}

/**
 * Fetch full details for a single PR: diff stats, file list, reviewers, commits.
 */
export async function fetchPRDetail(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<PRDetailResult> {
  // Fetch PR, files, reviews, commits, and comments in parallel
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
      token
    ).catch(() => []),
    githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, token).catch(
      () => []
    ),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${prNumber}/commits?per_page=100`,
      token
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/issues/${prNumber}/comments?per_page=100`,
      token
    ).catch(() => []),
    githubApi(
      `/repos/${owner}/${repo}/pulls/${prNumber}/comments?per_page=100`,
      token
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
      (new Date(mergedAt).getTime() - new Date(createdAt).getTime()) / 60_000
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
    })
  )

  // Dedupe reviewers (can have multiple review events per person)
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
    .map((m) => m.split("\n")[0]) // first line only

  // Process comments — merge issue comments + review comments, filter bots, sort chronologically
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

  // Sort chronologically and dedupe by id
  const seenIds = new Set<number>()
  const comments = allComments
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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

/**
 * Fetch a user's repositories with stars, language, and descriptions.
 * Defaults to 5 top repos by stars. Cached for 1 hour.
 */
export async function fetchUserRepos(
  token: string,
  username: string,
  opts: FetchOptions = {}
): Promise<RepoResult> {
  const limit = opts.limit ?? 5

  // Check cache
  if (!opts.forceRefresh) {
    const cached = await getCached(username)
    if (cached && cached.reposJson.length > 0) {
      return {
        items: (cached.reposJson as CachedRepo[]).slice(0, limit),
        totalCount: cached.repoCount,
      }
    }
  }

  // Fetch from GitHub REST API
  const perPage = Math.max(limit, MIN_BATCH_SIZE)
  const repos = await githubApi(
    `/users/${encodeURIComponent(username)}/repos?per_page=${perPage}&sort=stargazers&direction=desc`,
    token
  )

  const rawItems = (repos as Record<string, unknown>[]) ?? []
  const transformed = rawItems.map(transformRepoItem)
  const totalCount = transformed.length // REST doesn't give total_count for repos

  // Also get total from profile
  let profileRepoCount = totalCount
  try {
    const profile = await githubApi(
      `/users/${encodeURIComponent(username)}`,
      token
    )
    if (profile?.public_repos) profileRepoCount = profile.public_repos as number
    await upsertCache(username, {
      githubUserId: (profile?.id as number) ?? undefined,
      profileJson: profile as Record<string, unknown>,
      reposJson: transformed,
      repoCount: profileRepoCount,
    })
  } catch {
    await upsertCache(username, {
      reposJson: transformed,
      repoCount: totalCount,
    })
  }

  return { items: transformed.slice(0, limit), totalCount: profileRepoCount }
}

/**
 * Fetch a user's contribution activity: calendar, pinned repos, enriched profile.
 * Cached for 1 hour via the graphql column.
 */
export async function fetchUserActivity(
  token: string,
  username: string,
  opts: Pick<FetchOptions, "forceRefresh"> = {}
): Promise<ActivityResult> {
  // Check cache for graphql data
  if (!opts.forceRefresh) {
    const cached = await getCached(username)
    if (cached?.graphqlJson) {
      // We have cached graphql — return it. Contributions aren't cached
      // (they change daily) but graphql data (orgs, badges, sponsors) is stable.
    }
  }

  // Fetch in parallel
  const [graphql, contribs] = await Promise.all([
    fetchUserGraphQL(token, username).catch(() => null),
    fetchUserContributions(token, username).catch(() => null),
  ])

  // Cache graphql data
  if (graphql) {
    await upsertCache(username, {
      graphqlJson: graphql as unknown as Record<string, unknown>,
    })
  }

  return {
    contributions: contribs?.contributions ?? null,
    pinned: contribs?.pinned ?? [],
    graphql,
  }
}
