import { db } from "@tripwire/db/client"
import { organizations, repositories, account, member } from "@tripwire/db"
import { eq, and } from "drizzle-orm"

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
    console.log(
      "[Install] Action: deleted, installation:",
      payload.installation.id
    )
    await db
      .delete(organizations)
      .where(eq(organizations.githubInstallationId, payload.installation.id))
    console.log("[Install] ✓ Deleted org")
  }
}

async function onInstallationCreated(payload: InstallationPayload) {
  const { installation } = payload
  console.log("[Install] Action: created")
  console.log(
    "[Install] Sender:",
    payload.sender.login,
    "(ID:",
    payload.sender.id,
    ")"
  )
  console.log(
    "[Install] Account:",
    installation.account.login,
    "(ID:",
    installation.account.id,
    ")"
  )
  console.log("[Install] Repos in payload:", payload.repositories?.length ?? 0)

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
    console.log(
      `[Install] ✗ No matching account for GitHub user ${payload.sender.login} (${payload.sender.id}). They need to sign up first.`
    )
    return
  }

  const ownerId = senderAccount.userId
  console.log("[Install] ✓ Found account, userId:", ownerId)

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
    console.log(
      `[Install] ✓ Created org "${installation.account.login}" (ID: ${org.id}), owned by user ${ownerId}`
    )
  } else {
    org = existingOrgs[0]
    if (!org.ownerId || org.ownerId !== ownerId) {
      await db
        .update(organizations)
        .set({ ownerId, updatedAt: new Date() })
        .where(eq(organizations.id, org.id))
      console.log("[Install] Updated org owner to", ownerId)
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
        console.log("[Install] ✓ Added repo:", repo.full_name)
      }
    }
  }
  console.log("[Install] ✓ Installation complete")
}

export async function handleInstallationRepositories(
  payload: InstallationReposPayload
) {
  console.log(
    "[RepoChange] Action:",
    payload.action,
    "installation:",
    payload.installation.id
  )

  const [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.githubInstallationId, payload.installation.id))

  if (!org) {
    console.log(
      `[RepoChange] ✗ No org found for installation ${payload.installation.id}`
    )
    return
  }

  const added = payload.repositories_added ?? []
  for (const repo of added) {
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
      console.log(`[RepoChange] ✓ Added repo ${repo.full_name}`)
    }
  }

  const removed = payload.repositories_removed ?? []
  for (const repo of removed) {
    await db
      .delete(repositories)
      .where(eq(repositories.githubRepoId, repo.id))
    console.log(`[RepoChange] ✓ Removed repo ${repo.id}`)
  }
}
