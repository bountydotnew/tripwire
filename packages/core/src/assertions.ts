import { and, eq } from "drizzle-orm"
import { createError } from "evlog"
import { db } from "@tripwire/db/client"
import {
  contributorRequests,
  events,
  organizations,
  repositories,
} from "@tripwire/db"

const NOT_FOUND = () =>
  createError({
    code: "resource.not_found",
    status: 404,
    message: "Not found",
  })

/**
 * Confirm `userId` owns the Tripwire `orgId` (GitHub App installation).
 * Throws `resource.not_found` otherwise. Returns the org row.
 */
export async function assertOrgOwner(userId: string, orgId: string) {
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), eq(organizations.ownerId, userId)))
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `userId` owns the org that owns `repoId`. Returns both rows.
 */
export async function assertRepoOwner(userId: string, repoId: string) {
  const [row] = await db
    .select({ repo: repositories, org: organizations })
    .from(repositories)
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(and(eq(repositories.id, repoId), eq(organizations.ownerId, userId)))
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `repoId` belongs to the Better Auth organization `baOrgId`.
 * Returns both rows so callers don't have to re-fetch (mirrors the shape
 * of `assertRepoOwner`). Used to defend against cross-org repo references
 * slipping in: even if a user is a member of both orgs A and B, a tool
 * invoked in A's session must not be able to read B's repo by passing
 * the other repoId.
 */
export async function assertRepoBelongsToOrg(repoId: string, baOrgId: string) {
  const [row] = await db
    .select({ repo: repositories, org: organizations })
    .from(repositories)
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(
      and(
        eq(repositories.id, repoId),
        eq(organizations.betterAuthOrgId, baOrgId)
      )
    )
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `eventId`'s repo belongs to Better Auth org `baOrgId`. Returns
 * the event, its repo, and the owning org row.
 */
export async function assertEventBelongsToOrg(
  eventId: string,
  baOrgId: string
) {
  const [row] = await db
    .select({ event: events, repo: repositories, org: organizations })
    .from(events)
    .innerJoin(repositories, eq(events.repoId, repositories.id))
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(
      and(eq(events.id, eventId), eq(organizations.betterAuthOrgId, baOrgId))
    )
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `requestId`'s repo belongs to Better Auth org `baOrgId`. Returns
 * the contributor request, its repo, and the owning org row.
 */
export async function assertRequestBelongsToOrg(
  requestId: string,
  baOrgId: string
) {
  const [row] = await db
    .select({
      request: contributorRequests,
      repo: repositories,
      org: organizations,
    })
    .from(contributorRequests)
    .innerJoin(repositories, eq(contributorRequests.repoId, repositories.id))
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(
      and(
        eq(contributorRequests.id, requestId),
        eq(organizations.betterAuthOrgId, baOrgId)
      )
    )
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `userId` owns the repo that emitted `eventId`. Returns the event,
 * its repo, and the owning org.
 */
export async function assertEventOwner(userId: string, eventId: string) {
  const [row] = await db
    .select({ event: events, repo: repositories, org: organizations })
    .from(events)
    .innerJoin(repositories, eq(events.repoId, repositories.id))
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(and(eq(events.id, eventId), eq(organizations.ownerId, userId)))
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}

/**
 * Confirm `userId` owns the repo that received `requestId`. Returns the
 * contributor request, its repo, and the owning org.
 */
export async function assertRequestOwner(userId: string, requestId: string) {
  const [row] = await db
    .select({
      request: contributorRequests,
      repo: repositories,
      org: organizations,
    })
    .from(contributorRequests)
    .innerJoin(repositories, eq(contributorRequests.repoId, repositories.id))
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(
      and(
        eq(contributorRequests.id, requestId),
        eq(organizations.ownerId, userId)
      )
    )
    .limit(1)
  if (!row) throw NOT_FOUND()
  return row
}
