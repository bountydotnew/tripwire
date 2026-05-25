/**
 * Signal-key taxonomy for cache invalidation. Each cached read declares
 * which signals it depends on; webhook deliveries bump matching signals;
 * the cache engine then treats any entry with `fetched_at < signal.updated_at`
 * as stale on next read.
 *
 * Tripwire's reads are mostly user-scoped (one GitHub username's profile/PRs/repos)
 * and repo-scoped, so the taxonomy is much smaller than diffkit's. Add new keys
 * here when a new cached read needs invalidation.
 */
export const githubRevalidationSignalKeys = {
  user: (input: { username: string }) =>
    `user:${input.username.toLowerCase()}`,
  repo: (input: { owner: string; repo: string }) =>
    `repo:${input.owner.toLowerCase()}/${input.repo.toLowerCase()}`,
  installationAccess: "installationAccess",
} as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function getRepositoryIdentity(payload: unknown) {
  if (!isRecord(payload)) return null
  const repository = payload.repository
  if (!isRecord(repository)) return null

  const repo = repository.name
  const owner = isRecord(repository.owner) ? repository.owner.login : null
  if (typeof owner !== "string" || typeof repo !== "string") return null

  return { owner, repo }
}

function getSenderLogin(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.sender)) return null
  const login = payload.sender.login
  return typeof login === "string" ? login : null
}

function getPullRequestAuthorLogin(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.pull_request)) return null
  const user = payload.pull_request.user
  if (!isRecord(user)) return null
  const login = user.login
  return typeof login === "string" ? login : null
}

function getIssueAuthorLogin(payload: unknown) {
  if (!isRecord(payload) || !isRecord(payload.issue)) return null
  const user = payload.issue.user
  if (!isRecord(user)) return null
  const login = user.login
  return typeof login === "string" ? login : null
}

/**
 * Map an incoming GitHub webhook delivery to the set of signal keys whose
 * cached payloads should be considered stale on next read.
 *
 * Cheap: returns string keys. Doesn't query the DB; the caller passes the
 * result to `markGitHubRevalidationSignals`.
 */
export function getGitHubWebhookRevalidationSignalKeys(
  event: string,
  payload: unknown,
): string[] {
  if (
    event === "installation" ||
    event === "installation_repositories" ||
    event === "github_app_authorization"
  ) {
    return [githubRevalidationSignalKeys.installationAccess]
  }

  const repository = getRepositoryIdentity(payload)
  if (!repository) return []

  if (event === "pull_request") {
    const author = getPullRequestAuthorLogin(payload)
    const keys = [
      githubRevalidationSignalKeys.repo({
        owner: repository.owner,
        repo: repository.repo,
      }),
    ]
    if (author) {
      keys.push(githubRevalidationSignalKeys.user({ username: author }))
    }
    return keys
  }

  if (event === "issues") {
    const author = getIssueAuthorLogin(payload)
    const keys = [
      githubRevalidationSignalKeys.repo({
        owner: repository.owner,
        repo: repository.repo,
      }),
    ]
    if (author) {
      keys.push(githubRevalidationSignalKeys.user({ username: author }))
    }
    return keys
  }

  if (event === "issue_comment") {
    // Comments don't change the contributor's PR/issue counts but they do
    // change the repo's activity surface. Sender is bumped because we may
    // cache "user X's recent activity" reads.
    const sender = getSenderLogin(payload)
    const keys = [
      githubRevalidationSignalKeys.repo({
        owner: repository.owner,
        repo: repository.repo,
      }),
    ]
    if (sender) {
      keys.push(githubRevalidationSignalKeys.user({ username: sender }))
    }
    return keys
  }

  if (event === "push" || event === "create" || event === "delete") {
    return [
      githubRevalidationSignalKeys.repo({
        owner: repository.owner,
        repo: repository.repo,
      }),
    ]
  }

  return []
}
