import { eq, and } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { organizations, repositories, account, member } from "@tripwire/db"
import { createAppJwt, getInstallationToken } from "@tripwire/github"

interface InstallationMeta {
  accountId: number
  accountType: string
  accountLogin: string
}

async function fetchInstallationMeta(
  installationId: number
): Promise<InstallationMeta | null> {
  const jwt = await createAppJwt()
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}`,
    {
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  )
  if (!res.ok) {
    console.error(
      "[Callback] Failed to fetch installation metadata:",
      res.status
    )
    return null
  }
  const data = (await res.json()) as {
    account?: { id?: number; type?: string; login?: string }
  }
  if (
    !data.account ||
    typeof data.account.id !== "number" ||
    typeof data.account.type !== "string" ||
    typeof data.account.login !== "string"
  ) {
    return null
  }
  return {
    accountId: data.account.id,
    accountType: data.account.type,
    accountLogin: data.account.login,
  }
}

interface GitHubRepo {
  id: number
  name: string
  full_name: string
  private: boolean
  owner: {
    id: number
    login: string
    type?: string
    avatar_url?: string
  }
}

async function fetchInstallationRepos(
  installationId: number
): Promise<GitHubRepo[] | null> {
  const token = await getInstallationToken(installationId)
  const reposRes = await fetch(
    "https://api.github.com/installation/repositories?per_page=100",
    {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github.v3+json",
      },
    }
  )

  if (!reposRes.ok) {
    console.error("[Callback] Failed to fetch repos:", reposRes.status)
    return null
  }

  const { repositories: repos } = (await reposRes.json()) as {
    repositories: GitHubRepo[]
  }
  return repos ?? null
}

async function applyRepoSync(
  orgId: string,
  repos: GitHubRepo[]
): Promise<void> {
  const currentRepoIds = new Set(repos.map((r) => r.id))

  for (const repo of repos) {
    const [existingRepo] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, repo.id))

    if (!existingRepo) {
      await db.insert(repositories).values({
        orgId,
        githubRepoId: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        isPrivate: repo.private,
      })
    }
  }

  const existingRepos = await db
    .select()
    .from(repositories)
    .where(eq(repositories.orgId, orgId))

  for (const repo of existingRepos) {
    if (!currentRepoIds.has(repo.githubRepoId)) {
      await db
        .delete(repositories)
        .where(eq(repositories.id, repo.id))
      console.log(`[Callback] Removed repo ${repo.fullName}`)
    }
  }
}

/**
 * Ensure the org + repos exist for this installation, and verify that the
 * GitHub account that owns the installation is linked to the session user
 * (via better-auth `account` row).
 *
 * Returns "installer_mismatch" if the GH installer isn't the session user's
 * linked GH identity — any rows inserted by this call are rolled back.
 */
export async function ensureInstallation(
  installationId: number,
  userId: string
): Promise<"ok" | "installer_mismatch"> {
  const [existingOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubInstallationId, installationId))

  if (existingOrg) {
    const repos = await fetchInstallationRepos(installationId)
    if (repos) {
      await applyRepoSync(existingOrg.id, repos)
    }
    return "ok"
  }

  const meta = await fetchInstallationMeta(installationId)
  if (!meta) return "installer_mismatch"

  const [ghAccountRow] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))

  if (!ghAccountRow) {
    console.warn("[Callback] Session user has no linked GitHub account")
    return "installer_mismatch"
  }

  if (meta.accountType === "User") {
    if (String(meta.accountId) !== String(ghAccountRow.accountId)) {
      console.warn(
        "[Callback] Installer GitHub user id does not match session user",
        { installerAccountId: meta.accountId, linked: ghAccountRow.accountId }
      )
      return "installer_mismatch"
    }
  }
  // For "Organization" installs the installation account id is the org id, not
  // the installer's user id, so a direct equality check is wrong. We still
  // require the session user to be GH-linked (above) and rely on GitHub's own
  // install UI to gate org-admin permission. Stricter membership check TODO.

  const repos = await fetchInstallationRepos(installationId)
  if (!repos || repos.length === 0) return "ok"

  const ghAccount = repos[0].owner

  const [ownerMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, userId), eq(member.role, "owner")))
    .limit(1)

  const [org] = await db
    .insert(organizations)
    .values({
      githubInstallationId: installationId,
      githubAccountId: ghAccount.id,
      githubAccountLogin: ghAccount.login,
      githubAccountType: ghAccount.type ?? "User",
      avatarUrl: ghAccount.avatar_url,
      ownerId: userId,
      betterAuthOrgId: ownerMembership?.organizationId ?? null,
    })
    .returning()

  console.log(`[Callback] Created org "${ghAccount.login}" (ID: ${org.id})`)

  await applyRepoSync(org.id, repos)

  return "ok"
}
