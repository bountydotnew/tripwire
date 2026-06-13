import { and, eq, sql } from "drizzle-orm"
import { createLogger } from "@tripwire/logger"
import { db } from "@tripwire/db/client"
import { events, githubReputation, type EventAction } from "@tripwire/db"
import {
  computeContributorScore,
  fetchContributorSignals,
  isBotOrGhost,
} from "@tripwire/core"
import type { GitHubIssueMin, GitHubPullRequestMin } from "@tripwire/github"

const logger = createLogger("visibility-sync")

const BACKFILL_ACTION: EventAction = "pipeline_allowed"

// GitHub's secondary-abuse limits kick in around ~10 concurrent requests
// per installation token; 8 keeps us comfortably under.
const SCORE_WORKERS = 8

type EventInsert = typeof events.$inferInsert
type EventBuild = { username: string; row: EventInsert }

export function buildBackfillEventRows(
  repoId: string,
  syncRunId: string,
  prs: GitHubPullRequestMin[],
  issues: GitHubIssueMin[]
): EventBuild[] {
  const out: EventBuild[] = []
  for (const pr of prs) {
    const username = pr.user?.login
    if (!username || isBotOrGhost(username)) continue
    out.push({
      username,
      row: {
        repoId,
        action: BACKFILL_ACTION,
        severity: "info",
        description: pr.title,
        contentType: "pull_request",
        targetGithubUsername: username,
        targetGithubUserId: pr.user?.id ?? null,
        githubRef: `#${pr.number}`,
        metadata: {
          source: "history_backfill",
          kind: "pr",
          state: pr.state,
          mergedAt: pr.merged_at,
          syncRunId,
        },
        createdAt: new Date(pr.created_at),
      },
    })
  }
  for (const iss of issues) {
    const username = iss.user?.login
    if (!username || isBotOrGhost(username)) continue
    out.push({
      username,
      row: {
        repoId,
        action: BACKFILL_ACTION,
        severity: "info",
        description: iss.title,
        contentType: "issue",
        targetGithubUsername: username,
        targetGithubUserId: iss.user?.id ?? null,
        githubRef: `#${iss.number}`,
        metadata: {
          source: "history_backfill",
          kind: "issue",
          state: iss.state,
          syncRunId,
        },
        createdAt: new Date(iss.created_at),
      },
    })
  }
  return out
}

export async function scoreSingleContributor(
  repoId: string,
  username: string,
  token: string
): Promise<number | null> {
  const signals = await fetchContributorSignals({
    username,
    token,
    contextRepoId: repoId,
  })
  const result = computeContributorScore(signals.scoreInput)
  const clamped = Math.round(Math.max(0, Math.min(100, result.total)))
  await db
    .update(githubReputation)
    .set({ score: clamped, updatedAt: new Date() })
    .where(
      and(
        eq(githubReputation.repoId, repoId),
        sql`lower(${githubReputation.githubUsername}) = ${username.toLowerCase()}`
      )
    )
  return clamped
}

export async function recomputeRichScores(
  repoId: string,
  token: string
): Promise<{ scored: number; skipped: number }> {
  const contributors = await db
    .select({ username: githubReputation.githubUsername })
    .from(githubReputation)
    .where(eq(githubReputation.repoId, repoId))

  let scored = 0
  let skipped = 0
  await runInWorkers(contributors, SCORE_WORKERS, async ({ username }) => {
    try {
      await scoreSingleContributor(repoId, username, token)
      scored++
    } catch (err) {
      skipped++
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn("score skipped", { username, reason: msg })
    }
  })
  return { scored, skipped }
}

async function runInWorkers<T>(
  items: T[],
  workers: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return
  const queue = items.slice()
  const worker = async () => {
    while (queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) return
      await fn(next)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(workers, items.length) }, worker)
  )
}
