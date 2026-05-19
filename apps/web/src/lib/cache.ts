/**
 * Cache invalidation helpers.
 *
 * Centralises cross-query invalidation so view components don't
 * need to know which query keys exist. Call one function and every
 * relevant cache entry gets refreshed.
 */

import type { QueryClient } from "@tanstack/react-query"
import { qk } from "./query-keys"

/** Invalidate all cached GitHub data for a user (profile, repos, contributions, etc.) */
export function invalidateGitHubUser(
  queryClient: QueryClient,
  username: string
) {
  queryClient.invalidateQueries({
    queryKey: ["github", "user", username.toLowerCase()],
  })
  queryClient.invalidateQueries({
    queryKey: ["github", "repos", username.toLowerCase()],
  })
  queryClient.invalidateQueries({
    queryKey: ["github", "profile", username.toLowerCase()],
  })
  queryClient.invalidateQueries({
    queryKey: ["github", "contributions", username.toLowerCase()],
  })
  queryClient.invalidateQueries({
    queryKey: ["github", "achievements", username.toLowerCase()],
  })
}

/** Invalidate everything scoped to a specific repo (events, rules, lists, reputation). */
export function invalidateRepoData(queryClient: QueryClient, repoId: string) {
  // Broad prefix-based invalidation — catches all tRPC queries that include this repoId
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      // tRPC keys are nested arrays. Check if repoId appears anywhere.
      return JSON.stringify(key).includes(repoId)
    },
  })
}

/** Invalidate event-related caches for a repo. */
export function invalidateEventCaches(
  queryClient: QueryClient,
  repoId: string
) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const key = query.queryKey
      const str = JSON.stringify(key)
      return (
        str.includes(repoId) &&
        (str.includes("events") ||
          str.includes("digest") ||
          str.includes("countsByAction") ||
          str.includes("severityCounts"))
      )
    },
  })
}

/** Invalidate list-related caches (whitelist + blacklist) for a repo. */
export function invalidateListCaches(queryClient: QueryClient, repoId: string) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const str = JSON.stringify(query.queryKey)
      return (
        str.includes(repoId) &&
        (str.includes("whitelist") || str.includes("blacklist"))
      )
    },
  })
}

/** Invalidate rule config caches for a repo. */
export function invalidateRuleCaches(queryClient: QueryClient, repoId: string) {
  queryClient.invalidateQueries({
    predicate: (query) => {
      const str = JSON.stringify(query.queryKey)
      return str.includes(repoId) && str.includes("rules")
    },
  })
}

/** Invalidate workspace repos (after org switch, install, etc.) */
export function invalidateWorkspaceRepos(
  queryClient: QueryClient,
  baOrgId?: string
) {
  if (baOrgId) {
    queryClient.invalidateQueries({ queryKey: qk.workspace.repos(baOrgId) })
  }
  // Also invalidate the legacy myRepos query
  queryClient.invalidateQueries({
    predicate: (query) => JSON.stringify(query.queryKey).includes("myRepos"),
  })
}
