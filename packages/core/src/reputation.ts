import { and, eq, sql } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { githubReputation } from "@tripwire/db"
import { logEvent } from "./events"

export interface ResetContributorScoreOptions {
  repoId: string
  /** ID of the maintainer performing the reset (for audit). */
  userId: string
  /** Optional GitHub user id; recorded if known. */
  githubUserId?: number
  /** GitHub username being reset (case-insensitive). */
  username: string
  /** Free-form reason; surfaces in the score_reset event. */
  reason?: string
}

export interface ResetContributorScoreResult {
  ok: boolean
  message: string
  resetAt: Date
  previousTotals: {
    blocks: number
    allows: number
    nearMisses: number
    score: number
  } | null
}

/**
 * Forgive a user's accumulated Tripwire history for a repo, so future score
 * computations treat them as a clean slate.
 *
 *   - Zeros the reputation totals on github_reputation (drops their position
 *     on the leaderboard).
 *   - Stamps scoreResetAt = now() so gatherUserSignals (used by lookup_user
 *     and score_breakdown) ignores any event older than the reset.
 *   - Emits a score_reset event so the audit trail records who reset whom.
 *
 * The events themselves are NOT deleted — they remain visible in the events
 * feed for transparency. Only their effect on scoring is suppressed.
 */
export async function resetContributorScore(
  opts: ResetContributorScoreOptions
): Promise<ResetContributorScoreResult> {
  const username = opts.username.toLowerCase()
  const now = new Date()

  const [existing] = await db
    .select()
    .from(githubReputation)
    .where(
      and(
        eq(githubReputation.repoId, opts.repoId),
        sql`lower(${githubReputation.githubUsername}) = ${username}`
      )
    )
    .limit(1)

  const previousTotals = existing
    ? {
        blocks: existing.totalBlocks,
        allows: existing.totalAllows,
        nearMisses: existing.totalNearMisses,
        score: existing.score,
      }
    : null

  if (existing) {
    await db
      .update(githubReputation)
      .set({
        totalBlocks: 0,
        totalAllows: 0,
        totalNearMisses: 0,
        score: 0,
        scoreResetAt: now,
        scoreResetByUserId: opts.userId,
        updatedAt: now,
      })
      .where(eq(githubReputation.id, existing.id))
  } else {
    await db.insert(githubReputation).values({
      repoId: opts.repoId,
      githubUsername: username,
      githubUserId: opts.githubUserId,
      totalBlocks: 0,
      totalAllows: 0,
      totalNearMisses: 0,
      score: 0,
      scoreResetAt: now,
      scoreResetByUserId: opts.userId,
    })
  }

  await logEvent({
    repoId: opts.repoId,
    action: "score_reset",
    severity: "info",
    description: opts.reason
      ? `@${username} contributor score reset — ${opts.reason}`
      : `@${username} contributor score reset`,
    targetGithubUsername: username,
    targetGithubUserId: opts.githubUserId,
    metadata: {
      resetByUserId: opts.userId,
      previousTotals,
      reason: opts.reason ?? null,
    },
  })

  return {
    ok: true,
    message: previousTotals
      ? `Reset @${username}'s score. Cleared ${previousTotals.blocks} blocks, ${previousTotals.allows} allows, ${previousTotals.nearMisses} near-misses.`
      : `Reset @${username}'s score (no prior history on file).`,
    resetAt: now,
    previousTotals,
  }
}
