/**
 * Per-resource freshness policy. Each entry maps a resource category
 * to its in-memory React Query stale/gc times and the server-side
 * `freshForMs` used by the cache engine. Ported from diffkit's
 * github-cache-policy table and trimmed to the resources tripwire
 * actually uses today; add a new category here when adding a new
 * cached read.
 */
export const githubCachePolicy = {
  /** Long-lived viewer/profile data that rarely changes. */
  viewer: {
    staleTimeMs: 30 * 60 * 1000,
    gcTimeMs: 24 * 60 * 60 * 1000,
  },
  /** A user's repo list — stable in normal use, webhook-bumped on installation changes. */
  reposList: {
    staleTimeMs: 10 * 60 * 1000,
    gcTimeMs: 12 * 60 * 60 * 1000,
  },
  /** Paginated search-style lists (PRs, issues by author). */
  list: {
    staleTimeMs: 2 * 60 * 1000,
    gcTimeMs: 60 * 60 * 1000,
  },
  /** Per-entity detail reads (one PR, one issue). */
  detail: {
    staleTimeMs: 30 * 1000,
    gcTimeMs: 10 * 60 * 1000,
  },
  /** Comments, reviews, timeline events — refresh more eagerly. */
  activity: {
    staleTimeMs: 20 * 1000,
    gcTimeMs: 10 * 60 * 1000,
  },
  /** Contributions calendar (graphql) — changes daily at most. */
  contributions: {
    staleTimeMs: 60 * 60 * 1000,
    gcTimeMs: 24 * 60 * 60 * 1000,
  },
  /** Repository metadata (stars, description, default branch). */
  repoMeta: {
    staleTimeMs: 30 * 60 * 1000,
    gcTimeMs: 24 * 60 * 60 * 1000,
  },
  /** Installation access index — webhook-driven, otherwise stable. */
  installationAccess: {
    staleTimeMs: 30 * 60 * 1000,
    gcTimeMs: 24 * 60 * 60 * 1000,
  },
} as const

export type GithubCachePolicyKey = keyof typeof githubCachePolicy
