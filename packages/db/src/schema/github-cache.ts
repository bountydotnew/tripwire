/**
 * Shared shapes for cached GitHub objects. These used to live alongside
 * the legacy `githubUserCache` table (removed when the read-through
 * cache engine landed). The interfaces stay here because they're the
 * canonical PR/repo shape consumed across the monorepo (core,
 * research, github data-factory).
 */

export interface CachedPR {
  title: string
  number: number
  htmlUrl: string
  state: string
  createdAt: string
  closedAt: string | null
  mergedAt: string | null
  repoFullName: string
  labels: Array<{ name: string; color: string }>
  authorLogin: string
  authorAvatar: string
  /** Enriched from PR detail endpoint */
  additions: number
  deletions: number
  changedFiles: number
  commits: number
  /** Minutes between PR open and merge (null if not merged) */
  timeToMergeMinutes: number | null
  draft: boolean
  /** merge_commit_sha or head sha */
  headSha: string | null
  body: string | null
  /** Who closed/merged the PR (null if still open) */
  closedBy: string | null
  /** true = author closed their own PR, false = someone else closed it */
  selfClosed: boolean | null
}

export interface CachedRepo {
  name: string
  fullName: string
  htmlUrl: string
  description: string | null
  stars: number
  forks: number
  language: string | null
  isFork: boolean
  createdAt: string
  updatedAt: string
  pushedAt: string | null
  defaultBranch: string | null
  openIssuesCount: number
  topics: string[]
  license: string | null
  size: number
  archived: boolean
}
