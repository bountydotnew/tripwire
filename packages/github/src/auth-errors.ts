/**
 * Classifies GitHub API errors. Used by callers that need to distinguish
 * "the user has to reinstall / reauthorize the GitHub App" (recoverable
 * with a redirect to GitHub) from generic errors (transient, wrong scope,
 * resource-not-found, etc.).
 *
 * Ported from diffkit's `github-auth-errors.ts`. Pure: takes any error
 * shape, returns boolean. Callers compose by branching on the result —
 * one path links to GitHub install, the other surfaces a normal toast.
 */

type GitHubErrorShape = {
  status?: number
  message?: string
  response?: {
    data?: unknown
    headers?: Record<string, unknown>
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

/**
 * Pulls the GitHub API's `message` field out of a response body. GitHub
 * surfaces machine-readable error context here (e.g. "Bad credentials"),
 * which is what we match on for the reauthorize branches.
 */
function getGitHubApiMessage(data: unknown): string {
  if (!isRecord(data)) return ""
  const message = data.message
  return typeof message === "string" ? message : ""
}

/**
 * Combine the thrown error's `.message` with the API response body's
 * `.message` field so a single grep covers both shapes. Lowercased
 * because GitHub isn't case-consistent across endpoints.
 */
export function compactGitHubErrorMessage(error: unknown): string {
  if (!isRecord(error)) {
    return ""
  }
  const wrapperMessage =
    typeof error.message === "string" ? (error.message as string) : ""
  const bodyMessage = getGitHubApiMessage(
    isRecord(error.response) ? (error.response as { data?: unknown }).data : null,
  )
  return `${wrapperMessage} ${bodyMessage}`.trim()
}

/**
 * Returns true when the error indicates that the user's GitHub App
 * install/token is no longer usable and they need to reauthorize.
 *
 * Cases that return TRUE:
 * - 401 Unauthorized (token revoked, expired, or wrong scope)
 * - 403 + body mentions "suspended", "new permissions", "additional
 *   permissions", "must be granted", or "permission... pending"
 *   (installation suspended or needs explicit user re-approval)
 * - 422 + body mentions "installation" + "suspend" or "permission"
 * - Generic Error message containing "bad credentials" or refresh-token
 *   failure markers (incorrect_client_credentials, bad_refresh_token,
 *   invalid_grant, refresh_token expired)
 *
 * Cases that return FALSE (default):
 * - 403 + "not accessible by integration" → scope problem, configure
 *   access on the App settings page, not a full reauthorize
 * - Network errors, 5xx, anything else
 */
export function shouldReauthorizeGitHubApp(error: unknown): boolean {
  if (!error) return false

  const wrapper = error as GitHubErrorShape
  const status = typeof wrapper.status === "number" ? wrapper.status : null
  const combined = compactGitHubErrorMessage(error).toLowerCase()

  if (status === 401) {
    return true
  }

  if (status === 403) {
    // Resource-scope 403s mean the install is fine but the App doesn't
    // have access to THIS specific resource. Don't bounce the user
    // through the full reauthorize flow for that.
    if (combined.includes("not accessible by integration")) {
      return false
    }
    if (
      combined.includes("suspended") ||
      combined.includes("new permissions") ||
      combined.includes("additional permissions") ||
      combined.includes("must be granted") ||
      (combined.includes("permission") && combined.includes("pending"))
    ) {
      return true
    }
  }

  if (
    status === 422 &&
    combined.includes("installation") &&
    (combined.includes("suspend") || combined.includes("permission"))
  ) {
    return true
  }

  // Generic error message fallbacks — these cover the case where the
  // caller has wrapped GitHub's response in a higher-level Error.
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    if (message.includes("bad credentials")) {
      return true
    }
    if (message.includes("docs.github.com/rest")) {
      // GitHub's terse "Bad credentials" body sometimes includes a docs
      // link instead of a plain message. Same root cause: token unusable.
      return true
    }
    if (message.includes("github app user token request failed")) {
      // OAuth-flow refresh failure — explicit reauthorize needed.
      if (
        message.includes("incorrect_client_credentials") ||
        message.includes("bad_refresh_token") ||
        message.includes("invalid_grant") ||
        message.includes("refresh_token") ||
        message.includes("expired")
      ) {
        return true
      }
    }
  }

  return false
}
