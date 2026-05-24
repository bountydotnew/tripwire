import { and, eq, sql, type Column, type SQL } from "drizzle-orm"
import {
  blacklistEntries,
  githubReputation,
  repositories,
  whitelistEntries,
} from "@tripwire/db"

export function whitelistJoinClause(repoId: string): SQL | undefined {
  return and(
    eq(whitelistEntries.repoId, repoId),
    sql`lower(${whitelistEntries.githubUsername}) = lower(${githubReputation.githubUsername})`
  )
}

export function blacklistJoinClause(repoId: string): SQL | undefined {
  return and(
    eq(blacklistEntries.repoId, repoId),
    sql`lower(${blacklistEntries.githubUsername}) = lower(${githubReputation.githubUsername})`
  )
}

export const excludeRepoOwner: SQL = sql`lower(${githubReputation.githubUsername}) <> lower(split_part(${repositories.fullName}, '/', 1))`

export function excludeMaintainerSelf(
  githubUserId: number | null
): SQL | undefined {
  if (githubUserId === null) return undefined
  return sql`(${githubReputation.githubUserId} is null or ${githubReputation.githubUserId} <> ${githubUserId})`
}

export function lowerInArray(column: Column, usernames: string[]): SQL {
  if (usernames.length === 0) return sql`false`
  return sql`lower(${column}) in (${sql.join(
    usernames.map((u) => sql`${u.toLowerCase()}`),
    sql`, `
  )})`
}
