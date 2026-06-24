import { db } from "@tripwire/db/client"
import {
  events,
  moderationItems,
  githubReputation,
  type EventAction,
  type EventSeverity,
  type EventContentType,
} from "@tripwire/db"
import { and, eq, inArray, sql } from "drizzle-orm"
import { isBotOrGhost } from "./contributor-identity"

/**
 * Pipeline outcomes that warrant human review and so seed a moderation queue
 * item. Only the batch (`logEvents`) path enqueues — each pipeline decision
 * runs through it exactly once, so the per-action audit events the webhook
 * handlers log separately (e.g. `pr_closed`) don't create duplicate items.
 * The backfill mirrors this set so live + seed stay consistent.
 */
export const QUEUEABLE_ACTIONS: readonly EventAction[] = [
  "pipeline_blocked",
  "blacklist_blocked",
  "pipeline_warned",
]
const QUEUEABLE_ACTION_SET = new Set<EventAction>(QUEUEABLE_ACTIONS)

/** Map a flagged event into a moderation_items row. */
export function toModerationItemRow(eventId: string, e: LogEventOptions) {
  return {
    repoId: e.repoId,
    source: "rule_flag" as const,
    subject: e.contentType ? ("content" as const) : ("user" as const),
    status: "open" as const,
    severity: e.severity ?? "warning",
    title: e.description?.split("\n")[0]?.slice(0, 140) || e.action,
    detail: e.description,
    contentType: e.contentType,
    githubRef: e.githubRef,
    ruleName: e.ruleName,
    targetGithubUsername: e.targetGithubUsername,
    targetGithubUserId: e.targetGithubUserId,
    eventId,
  }
}

interface LogEventOptions {
  repoId: string
  action: EventAction
  severity?: EventSeverity
  description?: string
  contentType?: EventContentType
  pipelineId?: string
  ruleName?: string
  targetGithubUsername?: string
  targetGithubUserId?: number
  githubRef?: string
  metadata?: Record<string, unknown>
}

/**
 * Log an event to the activity feed.
 *
 * @example
 * // Pipeline allowed
 * await logEvent({
 *   repoId: repo.id,
 *   action: "pipeline_allowed",
 *   severity: "success",
 *   description: "@octocat passed all 5 enabled rules",
 *   contentType: "pull_request",
 *   pipelineId: "abc-123",
 *   targetGithubUsername: "octocat",
 *   githubRef: "#42",
 * });
 *
 * @example
 * // Near-miss warning
 * await logEvent({
 *   repoId: repo.id,
 *   action: "rule_near_miss",
 *   severity: "warning",
 *   description: "@octocat has 17 merged PRs (threshold: 15)",
 *   ruleName: "minMergedPrs",
 *   targetGithubUsername: "octocat",
 *   metadata: { actual: 17, threshold: 15, ratio: 1.13 },
 * });
 */
export async function logEvent(options: LogEventOptions) {
  // Drop bot/ghost-targeted events at the ingest boundary, but only when the
  // event actually targets a user. Admin/config events with no target must
  // still log.
  if (
    options.targetGithubUsername &&
    isBotOrGhost(options.targetGithubUsername)
  ) {
    return
  }

  try {
    await db.insert(events).values({
      repoId: options.repoId,
      action: options.action,
      severity: options.severity ?? "info",
      description: options.description,
      contentType: options.contentType,
      pipelineId: options.pipelineId,
      ruleName: options.ruleName,
      targetGithubUsername: options.targetGithubUsername,
      targetGithubUserId: options.targetGithubUserId,
      githubRef: options.githubRef,
      metadata: options.metadata,
    })

    updateReputation(options).catch(() => {})
  } catch (err) {
    console.error("[Events] Failed to log event:", err)
  }
}

/**
 * Log multiple events in a single batch (used after pipeline evaluation).
 */
export async function logEvents(eventList: LogEventOptions[]) {
  const filtered = eventList.filter(
    (e) => !e.targetGithubUsername || !isBotOrGhost(e.targetGithubUsername)
  )
  if (filtered.length === 0) return

  try {
    const inserted = await db
      .insert(events)
      .values(
        filtered.map((e) => ({
          repoId: e.repoId,
          action: e.action,
          severity: e.severity ?? "info",
          description: e.description,
          contentType: e.contentType,
          pipelineId: e.pipelineId,
          ruleName: e.ruleName,
          targetGithubUsername: e.targetGithubUsername,
          targetGithubUserId: e.targetGithubUserId,
          githubRef: e.githubRef,
          metadata: e.metadata,
        }))
      )
      .returning({ id: events.id })

    // Update reputation for each pipeline event in the batch
    for (const e of filtered) {
      updateReputation(e).catch(() => {})
    }

    const flagged = inserted
      .map((row, i) => [row.id, filtered[i]] as const)
      .filter(([, e]) => QUEUEABLE_ACTION_SET.has(e.action))
    await enqueueModerationItems(flagged).catch((err) =>
      console.error("[Events] Failed to enqueue moderation items:", err)
    )
  } catch (err) {
    console.error("[Events] Failed to log batch events:", err)
  }
}

/**
 * Create review-queue items for freshly-flagged events, skipping content that
 * already has an open item (e.g. a reopened PR re-running the pipeline).
 */
async function enqueueModerationItems(
  flagged: ReadonlyArray<readonly [string, LogEventOptions]>
) {
  if (flagged.length === 0) return
  const repoId = flagged[0][1].repoId
  const refs = flagged
    .map(([, e]) => e.githubRef)
    .filter((r): r is string => !!r)

  const openForRefs =
    refs.length > 0
      ? await db
          .select({ githubRef: moderationItems.githubRef })
          .from(moderationItems)
          .where(
            and(
              eq(moderationItems.repoId, repoId),
              eq(moderationItems.status, "open"),
              inArray(moderationItems.githubRef, refs)
            )
          )
      : []
  const seenRefs = new Set(openForRefs.map((r) => r.githubRef))

  const rows = flagged
    .filter(([, e]) => !e.githubRef || !seenRefs.has(e.githubRef))
    .map(([id, e]) => toModerationItemRow(id, e))
  if (rows.length > 0) {
    await db.insert(moderationItems).values(rows)
  }
}

const REPUTATION_ACTIONS = new Set<string>([
  "pipeline_blocked",
  "pipeline_allowed",
  "rule_near_miss",
  "blacklist_blocked",
])

export interface ReputationUpdatedEvent {
  repoId: string
  username: string
  githubUserId?: number
}

type ReputationUpdateHook = (event: ReputationUpdatedEvent) => unknown

let reputationUpdateHook: ReputationUpdateHook | null = null

export function registerReputationUpdateHook(hook: ReputationUpdateHook): void {
  reputationUpdateHook = hook
}

async function updateReputation(options: LogEventOptions) {
  if (!options.targetGithubUsername) return
  if (!REPUTATION_ACTIONS.has(options.action)) return

  const username = options.targetGithubUsername.toLowerCase()
  const isBlock =
    options.action === "pipeline_blocked" ||
    options.action === "blacklist_blocked"
  const isAllow = options.action === "pipeline_allowed"
  const isNearMiss = options.action === "rule_near_miss"

  // `score` is owned by the rich-score pipeline (computeContributorScore via
  // the visibility sync). Webhooks only bump counts. Touching score here
  // would clobber the rich value with a counter formula.
  try {
    await db
      .insert(githubReputation)
      .values({
        githubUsername: username,
        githubUserId: options.targetGithubUserId ?? null,
        totalBlocks: isBlock ? 1 : 0,
        totalAllows: isAllow ? 1 : 0,
        totalNearMisses: isNearMiss ? 1 : 0,
      })
      .onConflictDoUpdate({
        target: githubReputation.githubUsername,
        set: {
          totalBlocks: isBlock
            ? sql`${githubReputation.totalBlocks} + 1`
            : githubReputation.totalBlocks,
          totalAllows: isAllow
            ? sql`${githubReputation.totalAllows} + 1`
            : githubReputation.totalAllows,
          totalNearMisses: isNearMiss
            ? sql`${githubReputation.totalNearMisses} + 1`
            : githubReputation.totalNearMisses,
          githubUserId:
            options.targetGithubUserId ?? sql`${githubReputation.githubUserId}`,
          lastSeenAt: new Date(),
          updatedAt: new Date(),
        },
      })

    if (reputationUpdateHook) {
      try {
        const result = reputationUpdateHook({
          repoId: options.repoId,
          username: options.targetGithubUsername,
          githubUserId: options.targetGithubUserId,
        })
        if (result instanceof Promise) result.catch(() => {})
      } catch {
        // hook failures must not break event logging
      }
    }
  } catch (err) {
    console.error("[Events] Failed to update reputation:", err)
  }
}
