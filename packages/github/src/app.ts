/**
 * GitHub App infrastructure — auth, tokens, and repo actions.
 *
 * Auth flow:
 * 1. Sign a JWT with the App's private key (RS256)
 * 2. Exchange JWT for an installation access token
 * 3. Cache until expires_at
 */

import { SignJWT, importPKCS8 } from "jose"
import * as crypto from "crypto"
import { createError } from "evlog"
import { env } from "@tripwire/env/server"

// Cache installation tokens: installationId -> { token, expiresAt }
const tokenCache = new Map<number, { token: string; expiresAt: number }>()

/**
 * Create a JWT signed with the GitHub App's private key.
 */
export async function createAppJwt(): Promise<string> {
  const appId = env.GITHUB_APP_ID
  const privateKey = env.GITHUB_APP_PRIVATE_KEY

  if (!appId || !privateKey) {
    throw createError({
      code: "github.app_credentials_missing",
      status: 500,
      message: "GitHub App credentials are not configured",
      why: "GITHUB_APP_ID and/or GITHUB_APP_PRIVATE_KEY environment variables are missing.",
      fix: "Set both env vars to your GitHub App's ID and private key, then restart the server.",
      internal: { hasAppId: !!appId, hasPrivateKey: !!privateKey },
    })
  }

  // The private key may have literal \n in env vars — normalize
  let normalizedKey = privateKey.replace(/\\n/g, "\n")

  // Convert PKCS#1 (RSA PRIVATE KEY) to PKCS#8 (PRIVATE KEY) if needed
  // GitHub generates keys in PKCS#1 format, but jose expects PKCS#8
  if (normalizedKey.includes("BEGIN RSA PRIVATE KEY")) {
    const keyObject = crypto.createPrivateKey(normalizedKey)
    normalizedKey = keyObject.export({ type: "pkcs8", format: "pem" }) as string
  }

  const key = await importPKCS8(normalizedKey, "RS256")

  const now = Math.floor(Date.now() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(appId)
    .setIssuedAt(now)
    .setExpirationTime(now + 9 * 60) // 9 min (GitHub max is 10)
    .sign(key)
}

/**
 * Delete (uninstall) a GitHub App installation.
 * Uses the App JWT directly, not an installation token.
 */
export async function deleteInstallation(
  installationId: number
): Promise<void> {
  const jwt = await createAppJwt()
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )
  if (!res.ok && res.status !== 404) {
    console.error(
      `[github] Failed to delete installation ${installationId}: ${res.status}`
    )
  }
}

/**
 * Get an installation access token for a GitHub App installation.
 * Caches tokens until 5 minutes before expiry.
 */
export async function getInstallationToken(
  installationId: number
): Promise<string> {
  // Check cache
  const cached = tokenCache.get(installationId)
  if (cached && cached.expiresAt > Date.now() + 5 * 60 * 1000) {
    return cached.token
  }

  const jwt = await createAppJwt()

  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  )

  if (!res.ok) {
    const text = await res.text()
    throw createError({
      code: "github.installation_token_failed",
      status: 502,
      message: "Failed to authenticate as the GitHub App installation",
      why: `GitHub returned HTTP ${res.status} when exchanging the App JWT.`,
      fix: "Verify the App is still installed on this org and the private key hasn't been rotated.",
      internal: { installationId, githubStatus: res.status, githubBody: text },
    })
  }

  const data = (await res.json()) as { token: string; expires_at: string }

  tokenCache.set(installationId, {
    token: data.token,
    expiresAt: new Date(data.expires_at).getTime(),
  })

  return data.token
}

export async function githubApi(
  endpoint: string,
  token: string,
  options: RequestInit = {}
) {
  const res = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...options.headers,
    },
  })

  if (!res.ok) {
    const text = await res.text()
    // Message format is preserved for callers that match on it (e.g. putRepoFile's 404/409 retries).
    throw createError({
      code: `github.api.${res.status}`,
      status: res.status >= 500 ? 502 : 500,
      message: `GitHub API ${res.status}: ${text}`,
      internal: { endpoint, githubStatus: res.status, githubBody: text },
    })
  }

  // Some responses (like DELETE) return empty body
  const text = await res.text()
  if (!text) return null
  return JSON.parse(text)
}

/** Close a pull request */
export async function closePullRequest(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  comment?: string
) {
  // Post comment first so it appears in the timeline
  if (comment) {
    console.log(`[GitHub] Posting comment to PR #${prNumber}...`)
    try {
      await githubApi(
        `/repos/${owner}/${repo}/issues/${prNumber}/comments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ body: comment }),
        }
      )
      console.log(`[GitHub] ✓ Comment posted to PR #${prNumber}`)
    } catch (err) {
      console.error(`[GitHub] ✗ Failed to post comment:`, err)
    }
  }

  console.log(`[GitHub] Closing PR #${prNumber}...`)
  return githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`, token, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed" }),
  })
}

/** Add a comment to an issue or PR (without closing) */
export async function addComment(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  body: string
) {
  return githubApi(
    `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
    token,
    {
      method: "POST",
      body: JSON.stringify({ body }),
    }
  )
}

/** Delete a comment */
export async function deleteComment(
  token: string,
  owner: string,
  repo: string,
  commentId: number
) {
  return githubApi(
    `/repos/${owner}/${repo}/issues/comments/${commentId}`,
    token,
    { method: "DELETE" }
  )
}

/** Close an issue */
export async function closeIssue(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  comment?: string
) {
  // Post comment first so it appears in the timeline
  if (comment) {
    console.log(`[GitHub] Posting comment to issue #${issueNumber}...`)
    try {
      await githubApi(
        `/repos/${owner}/${repo}/issues/${issueNumber}/comments`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ body: comment }),
        }
      )
      console.log(`[GitHub] ✓ Comment posted to issue #${issueNumber}`)
    } catch (err) {
      console.error(`[GitHub] ✗ Failed to post comment:`, err)
    }
  }

  console.log(`[GitHub] Closing issue #${issueNumber}...`)
  return githubApi(`/repos/${owner}/${repo}/issues/${issueNumber}`, token, {
    method: "PATCH",
    body: JSON.stringify({ state: "closed", state_reason: "not_planned" }),
  })
}

/**
 * Create or update a file in a repo via the contents API.
 * Reads the current sha (if file exists) so the PUT is an update, not a clobber.
 */
export async function putRepoFile(
  token: string,
  owner: string,
  repo: string,
  path: string,
  content: string,
  message: string,
  branch?: string
): Promise<void> {
  const refQuery = branch ? `?ref=${branch}` : ""
  const contentsUrl = `/repos/${owner}/${repo}/contents/${path}`
  const base64 = Buffer.from(content, "utf8").toString("base64")

  const readSha = async (): Promise<string | undefined> => {
    try {
      const existing = await githubApi(`${contentsUrl}${refQuery}`, token)
      if (existing && typeof existing === "object" && "sha" in existing) {
        return (existing as { sha: string }).sha
      }
      return undefined
    } catch (err) {
      // 404 means the file doesn't exist yet — that's fine.
      if (err instanceof Error && err.message.startsWith("GitHub API 404")) {
        return undefined
      }
      throw err
    }
  }

  const attempt = async (sha: string | undefined): Promise<void> => {
    const body: Record<string, unknown> = { message, content: base64 }
    if (sha) body.sha = sha
    if (branch) body.branch = branch
    await githubApi(contentsUrl, token, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  }

  let sha = await readSha()
  try {
    await attempt(sha)
  } catch (err) {
    // 409 = our sha was stale (concurrent write). Re-read and retry once.
    if (err instanceof Error && err.message.startsWith("GitHub API 409")) {
      sha = await readSha()
      await attempt(sha)
      return
    }
    throw err
  }
}

/** Get a collaborator's permission level on a repo */
export async function getCollaboratorPermission(
  token: string,
  repoFullName: string,
  username: string
): Promise<string> {
  try {
    const result = await githubApi(
      `/repos/${repoFullName}/collaborators/${username}/permission`,
      token
    )
    return result?.permission ?? "none"
  } catch {
    return "none"
  }
}
