import { createLogger } from "@tripwire/logger"
import { db } from "@tripwire/db/client"
import { organizations, repositories, account, member } from "@tripwire/db"
import { eq, and } from "drizzle-orm"

const installLogger = createLogger("Install")
const repoChangeLogger = createLogger("RepoChange")

export interface InstallationPayload {
  action: string
  installation: {
    id: number
    account: {
      id: number
      login: string
      type: string
      avatar_url: string
    }
  }
  repositories?: Array<{
    id: number
    name: string
    full_name: string
    private: boolean
  }>
  sender: { id: number; login: string }
}

export interface InstallationReposPayload {
  action: "added" | "removed"
  installation: { id: number }
  repositories_added?: Array<{
    id: number
    name: string
    full_name: string
    private: boolean
  }>
  repositories_removed?: Array<{ id: number }>
}

export async function handleInstallation(payload: InstallationPayload) {
  if (payload.action === "created") {
    await onInstallationCreated(payload)
  }
  if (payload.action === "deleted") {
    installLogger.info("action: deleted", { installationId: payload.installation.id })
    await db
      .delete(organizations)
      .where(eq(organizations.githubInstallationId, payload.installation.id))
    installLogger.info("deleted org", { installationId: payload.installation.id })
  }
}

async function onInstallationCreated(payload: InstallationPayload) {
  const { installation } = payload
  installLogger.info("action: created", {
    sender: payload.sender.login,
    senderId: payload.sender.id,
    account: installation.account.login,
    accountId: installation.account.id,
    repoCount: payload.repositories?.length ?? 0,
  })

  const [senderAccount] = await db
    .select()
    .from(account)
    .where(
      and(
        eq(account.providerId, "github"),
        eq(account.accountId, String(payload.sender.id))
      )
    )

  if (!senderAccount) {
    installLogger.warn("no matching account for GitHub user; they need to sign up first", {
      login: payload.sender.login,
      githubUserId: payload.sender.id,
    })
    return
  }

  const ownerId = senderAccount.userId
  installLogger.info("found account", { userId: ownerId })

  const existingOrgs = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubInstallationId, installation.id))

  const [ownerMembership] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(and(eq(member.userId, ownerId), eq(member.role, "owner")))
    .limit(1)

  let org
  if (existingOrgs.length === 0) {
    const [newOrg] = await db
      .insert(organizations)
      .values({
        githubInstallationId: installation.id,
        githubAccountId: installation.account.id,
        githubAccountLogin: installation.account.login,
        githubAccountType: installation.account.type,
        avatarUrl: installation.account.avatar_url,
        ownerId,
        betterAuthOrgId: ownerMembership?.organizationId ?? null,
      })
      .returning()
    org = newOrg
    installLogger.info("created org", {
      login: installation.account.login,
      orgId: org.id,
      ownerId,
    })
  } else {
    org = existingOrgs[0]
    if (!org.ownerId || org.ownerId !== ownerId) {
      await db
        .update(organizations)
        .set({ ownerId, updatedAt: new Date() })
        .where(eq(organizations.id, org.id))
      installLogger.info("updated org owner", { orgId: org.id, ownerId })
    }
  }

  if (payload.repositories && org) {
    for (const repo of payload.repositories) {
      const existing = await db
        .select()
        .from(repositories)
        .where(eq(repositories.githubRepoId, repo.id))

      if (existing.length === 0) {
        await db.insert(repositories).values({
          orgId: org.id,
          githubRepoId: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          isPrivate: repo.private,
        })
        installLogger.info("added repo", { fullName: repo.full_name })
      }
    }
  }
  installLogger.info("installation complete")
}

export async function handleInstallationRepositories(
  payload: InstallationReposPayload
) {
  repoChangeLogger.info("action received", {
    action: payload.action,
    installationId: payload.installation.id,
  })

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubInstallationId, payload.installation.id))

  if (!org) {
    repoChangeLogger.warn("no org found for installation", {
      installationId: payload.installation.id,
    })
    return
  }

  if (payload.action === "added" && payload.repositories_added) {
    for (const repo of payload.repositories_added) {
      const existing = await db
        .select()
        .from(repositories)
        .where(eq(repositories.githubRepoId, repo.id))

      if (existing.length === 0) {
        await db.insert(repositories).values({
          orgId: org.id,
          githubRepoId: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          isPrivate: repo.private,
        })
        repoChangeLogger.info("added repo", { fullName: repo.full_name })
      }
    }
  }

  if (payload.action === "removed" && payload.repositories_removed) {
    for (const repo of payload.repositories_removed) {
      await db
        .delete(repositories)
        .where(eq(repositories.githubRepoId, repo.id))
      repoChangeLogger.info("removed repo", { githubRepoId: repo.id })
    }
  }
}
