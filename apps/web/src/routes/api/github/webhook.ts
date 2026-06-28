import { createFileRoute } from "@tanstack/react-router"
import { verifyWebhookSignature } from "@tripwire/github"
import { handlePullRequest, handleIssue, handleComment } from "@tripwire/core"
// Side-effect import: registers the reputation-update → rescore hook so
// `updateReputation` calls from any webhook in this process fan out to the
// background scorer.
import "#/inngest/score-user"
import { db } from "@tripwire/db/client"
import { events, repositories, type EventAction } from "@tripwire/db"
import { eq } from "drizzle-orm"
import {
  handleInstallation,
  handleInstallationRepositories,
  type InstallationPayload,
  type InstallationReposPayload,
} from "#/lib/github/webhook"
import { markGitHubRevalidationSignals } from "@tripwire/github/cache"
import {
  markGitHubWebhookEventFailed,
  markGitHubWebhookEventProcessed,
  recordGitHubWebhookEvent,
} from "@tripwire/github/webhook-event"
import { getGitHubWebhookRevalidationSignalKeys } from "#/lib/github/revalidation"
import {
  installationPayloadSchema,
  installationReposPayloadSchema,
} from "#/lib/github/webhook-schemas"
import {
  ISSUE_EVAL_ACTIONS,
  PR_EVAL_ACTIONS,
  workflowTriggersForEvent,
} from "#/constants/webhook-events"
import { runWorkflowsForEvent } from "#/lib/workflow/dispatch"
import { broadcastSignalKeys } from "@tripwire/github/signal-broker"
import { createLogger } from "@tripwire/logger"

const log = createLogger("webhook")

type WebhookCtx = {
  installationId: number
  repoFullName: string
  githubRepoId: number
  senderLogin: string
  senderId: number
  senderType?: string
}

/**
 * Structural shape for any GitHub webhook delivery the route reads. All
 * fields are optional because we don't trust the parsed body until we've
 * narrowed it — the install / install-repos handlers each have their own
 * stricter input types and the type guards below upgrade the wide shape
 * to those at the boundary.
 */
type WebhookRepo = { id: number; full_name: string }

type WebhookPullRequest = {
  id?: number
  number: number
  title: string
  body?: string | null
  html_url?: string
  merged?: boolean
  changed_files?: number
  additions?: number
  deletions?: number
  commits?: number
  head?: { ref?: string; sha?: string }
  base?: { ref?: string; sha?: string }
}

type WebhookIssue = {
  id?: number
  number: number
  title: string
  body?: string | null
  html_url?: string
}

type WebhookComment = {
  id: number
  body?: string | null
  html_url?: string
}

type WebhookRelease = {
  id?: number
  name?: string | null
  tag_name?: string
  html_url?: string
}

type GitHubWebhookPayload = {
  action?: string
  sender?: { login?: string; id?: number; type?: string }
  installation?: {
    id?: number
    account?: {
      id?: number
      login?: string
      type?: string
      avatar_url?: string
    }
  }
  repository?: WebhookRepo
  repositories?: Array<{
    id: number
    name: string
    full_name: string
    private: boolean
  }>
  repositories_added?: Array<{
    id: number
    name: string
    full_name: string
    private: boolean
  }>
  repositories_removed?: Array<{ id: number }>
  pull_request?: WebhookPullRequest
  issue?: WebhookIssue
  comment?: WebhookComment
  release?: WebhookRelease
  ref?: string
  before?: string
  after?: string
  forced?: boolean
  commits?: Array<{ id?: string; message?: string; url?: string }>
  head_commit?: { id?: string; message?: string; url?: string }
}

function isInstallationPayload(
  p: GitHubWebhookPayload
): p is GitHubWebhookPayload & InstallationPayload {
  return installationPayloadSchema.safeParse(p).success
}

function isInstallationReposPayload(
  p: GitHubWebhookPayload
): p is GitHubWebhookPayload & InstallationReposPayload {
  return installationReposPayloadSchema.safeParse(p).success
}

/**
 * Best-effort wrapper around the idempotency bookkeeping. We never want
 * recording the audit row to be the thing that fails the webhook — log
 * and continue.
 */
async function safeMarkProcessed(deliveryId: string | null): Promise<void> {
  if (!deliveryId) return
  try {
    await markGitHubWebhookEventProcessed(deliveryId)
  } catch (err) {
    log.error("failed to mark processed:", err)
  }
}

async function safeMarkFailed(
  deliveryId: string | null,
  err: unknown
): Promise<void> {
  if (!deliveryId) return
  try {
    await markGitHubWebhookEventFailed(
      deliveryId,
      err instanceof Error ? err.message : String(err)
    )
  } catch (logErr) {
    log.error("failed to record processing error:", logErr)
  }
}

async function handler({ request }: { request: Request }) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    log.error("GITHUB_WEBHOOK_SECRET is not configured")
    return new Response("Server misconfigured", { status: 500 })
  }

  const body = await request.text()
  const signature = request.headers.get("x-hub-signature-256")
  const valid = await verifyWebhookSignature(body, signature, secret)
  if (!valid) {
    return new Response("Invalid signature", { status: 401 })
  }

  const event = request.headers.get("x-github-event")
  const deliveryId = request.headers.get("x-github-delivery")
  const payload = JSON.parse(body) as GitHubWebhookPayload
  log.info("Event:", event, "| Action:", payload.action)

  // Idempotency: GitHub retries reuse the same X-GitHub-Delivery UUID.
  // Insert-or-ignore against `github_webhook_event` — if the row already
  // existed, this is a retry and we ACK without re-running the pipeline.
  // (Without `deliveryId` we can't dedupe; fall through and process.)
  const signalKeys = event
    ? getGitHubWebhookRevalidationSignalKeys(event, payload)
    : []
  if (deliveryId && event) {
    let isNewDelivery = true
    try {
      isNewDelivery = await recordGitHubWebhookEvent({
        deliveryId,
        event,
        signalKeys,
      })
    } catch (err) {
      // Fail open: better to process twice than to silently drop the webhook.
      log.error("failed to record delivery, processing anyway:", err)
    }
    if (!isNewDelivery) {
      log.info("duplicate delivery, skipping:", deliveryId)
      return new Response("OK (duplicate)", { status: 200 })
    }
  }

  // Mark response-cache signals before the durable-factory pipeline runs.
  // Best-effort: failures don't break the webhook — they just leave the
  // cache slightly more stale than necessary until the next webhook bump.
  // After marking, broadcast in-process so any connected SSE client gets
  // a sub-second push (poll layer is the safety net for cross-process).
  if (signalKeys.length > 0) {
    try {
      await markGitHubRevalidationSignals(signalKeys)
      broadcastSignalKeys(signalKeys)
    } catch (err) {
      log.error("mark signals failed:", err)
    }
  }

  const installationId = payload.installation?.id
  if (!installationId) {
    await safeMarkProcessed(deliveryId)
    return new Response("No installation", { status: 200 })
  }

  try {
    if (event === "installation") {
      if (isInstallationPayload(payload)) {
        await handleInstallation(payload)
      } else {
        log.warn("installation payload missing required fields")
      }
    } else if (event === "installation_repositories") {
      if (isInstallationReposPayload(payload)) {
        await handleInstallationRepositories(payload)
      } else {
        log.warn("installation_repositories payload invalid")
      }
    } else if (payload.repository) {
      const repo = payload.repository
      const ctx: WebhookCtx = {
        installationId,
        repoFullName: repo.full_name,
        githubRepoId: repo.id,
        senderLogin: payload.sender?.login ?? "",
        senderId: payload.sender?.id ?? 0,
        senderType: payload.sender?.type,
      }
      await handleRepoEvent(event, payload, ctx, repo)
    }
    await safeMarkProcessed(deliveryId)
  } catch (err) {
    log.error("handler error:", err)
    await safeMarkFailed(deliveryId, err)
  }

  return new Response("OK", { status: 200 })
}

async function handleRepoEvent(
  event: string | null,
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx,
  repo: WebhookRepo
): Promise<void> {
  const [repoRow] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(eq(repositories.githubRepoId, repo.id))

  if (repoRow) {
    await recordRepoActivityEvent(event, payload, ctx, repoRow.id)
  }

  switch (event) {
    case "pull_request": {
      const pr = payload.pull_request
      // Re-evaluate on new commits (synchronize), title/body edits, and
      // draft→ready, not just first open — otherwise a flagged author can push
      // past the initial check.
      if (!pr || !PR_EVAL_ACTIONS.has(payload.action ?? "")) {
        break
      }
      await handlePullRequest(
        ctx,
        pr.number,
        pr.title,
        pr.body ?? undefined,
        pr.head?.sha
      )
      if (repoRow) {
        await dispatchWorkflows(
          ctx,
          repoRow.id,
          "pull_request",
          "pr",
          pr.number,
          payload.action
        )
      }
      break
    }

    case "issues": {
      const issue = payload.issue
      if (!issue || !ISSUE_EVAL_ACTIONS.has(payload.action ?? "")) {
        break
      }
      await handleIssue(ctx, issue.number, issue.title, issue.body ?? undefined)
      if (repoRow) {
        await dispatchWorkflows(
          ctx,
          repoRow.id,
          "issues",
          "issue",
          issue.number,
          payload.action
        )
      }
      break
    }

    case "issue_comment": {
      const issue = payload.issue
      const comment = payload.comment
      if (
        !issue ||
        !comment ||
        payload.sender?.type === "Bot" ||
        payload.action !== "created"
      ) {
        break
      }
      await handleComment(
        ctx,
        comment.id,
        issue.number,
        comment.body ?? undefined
      )
      if (repoRow) {
        await dispatchWorkflows(
          ctx,
          repoRow.id,
          "issue_comment",
          "issue",
          issue.number,
          payload.action
        )
      }
      break
    }
  }
}

async function dispatchWorkflows(
  ctx: WebhookCtx,
  repoId: string,
  eventType: "pull_request" | "issues" | "issue_comment",
  kind: "pr" | "issue",
  number: number,
  action: string | undefined
): Promise<void> {
  await runWorkflowsForEvent({
    repoId,
    installationId: ctx.installationId,
    repoFullName: ctx.repoFullName,
    triggers: workflowTriggersForEvent(eventType, action ?? ""),
    username: ctx.senderLogin,
    userId: ctx.senderId,
    kind,
    number,
  }).catch((err) => log.error("workflow dispatch failed:", err))
}

async function recordRepoActivityEvent(
  event: string | null,
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx,
  repoId: string
): Promise<void> {
  const activity = normalizeRepoActivityEvent(event, payload, ctx)
  if (!activity) return

  await db.insert(events).values({ repoId, ...activity })
}

function normalizeRepoActivityEvent(
  event: string | null,
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx
): {
  action: EventAction
  severity: "info" | "success"
  description: string
  contentType?: "pull_request" | "issue" | "comment"
  targetGithubUsername: string
  targetGithubUserId: number
  githubRef: string | null
  metadata: Record<string, unknown>
} | null {
  if (event === "pull_request" && payload.pull_request) {
    return normalizePullRequestActivity(payload, ctx)
  }
  if (event === "issues" && payload.issue) {
    return normalizeIssueActivity(payload, ctx)
  }
  if (event === "issue_comment" && payload.issue && payload.comment) {
    return normalizeCommentActivity(payload, ctx)
  }
  if (event === "push") {
    return normalizePushActivity(payload, ctx)
  }
  if (
    event === "release" &&
    payload.action === "published" &&
    payload.release
  ) {
    const release = payload.release
    const name = release.name || release.tag_name || "release"
    return {
      action: "github_release_published",
      severity: "success",
      description: name,
      targetGithubUsername: ctx.senderLogin,
      targetGithubUserId: ctx.senderId,
      githubRef: release.tag_name ?? null,
      metadata: {
        githubEvent: "release",
        githubAction: payload.action,
        releaseId: release.id,
        tagName: release.tag_name,
        url: release.html_url,
      },
    }
  }
  return null
}

function normalizePullRequestActivity(
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx
): ReturnType<typeof normalizeRepoActivityEvent> {
  const pr = payload.pull_request
  if (!pr) return null

  const action = pullRequestAction(payload.action, pr.merged === true)
  if (!action) return null

  return {
    action,
    severity: pr.merged === true ? "success" : "info",
    description: pr.title,
    contentType: "pull_request",
    targetGithubUsername: ctx.senderLogin,
    targetGithubUserId: ctx.senderId,
    githubRef: `#${pr.number}`,
    metadata: {
      githubEvent: "pull_request",
      githubAction: payload.action,
      pullRequestId: pr.id,
      number: pr.number,
      title: pr.title,
      url: pr.html_url,
      merged: pr.merged === true,
      changedFiles: pr.changed_files,
      additions: pr.additions,
      deletions: pr.deletions,
      commits: pr.commits,
      headRef: pr.head?.ref,
      headSha: pr.head?.sha,
      baseRef: pr.base?.ref,
      baseSha: pr.base?.sha,
    },
  }
}

function pullRequestAction(
  action: string | undefined,
  merged: boolean
): EventAction | null {
  if (action === "opened") return "github_pr_opened"
  if (action === "reopened") return "github_pr_reopened"
  if (action === "synchronize") return "github_pr_synchronized"
  if (action === "closed")
    return merged ? "github_pr_merged" : "github_pr_closed"
  return null
}

function normalizeIssueActivity(
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx
): ReturnType<typeof normalizeRepoActivityEvent> {
  const issue = payload.issue
  if (!issue) return null

  const action = issueAction(payload.action)
  if (!action) return null

  return {
    action,
    severity: action === "github_issue_closed" ? "success" : "info",
    description: issue.title,
    contentType: "issue",
    targetGithubUsername: ctx.senderLogin,
    targetGithubUserId: ctx.senderId,
    githubRef: `#${issue.number}`,
    metadata: {
      githubEvent: "issues",
      githubAction: payload.action,
      issueId: issue.id,
      number: issue.number,
      title: issue.title,
      url: issue.html_url,
    },
  }
}

function issueAction(action: string | undefined): EventAction | null {
  if (action === "opened") return "github_issue_opened"
  if (action === "reopened") return "github_issue_reopened"
  if (action === "closed") return "github_issue_closed"
  return null
}

function normalizeCommentActivity(
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx
): ReturnType<typeof normalizeRepoActivityEvent> {
  const issue = payload.issue
  const comment = payload.comment
  if (!issue || !comment || payload.action !== "created") return null

  return {
    action: "github_comment_created",
    severity: "info",
    description: `on ${issue.title}`,
    contentType: "comment",
    targetGithubUsername: ctx.senderLogin,
    targetGithubUserId: ctx.senderId,
    githubRef: `#${issue.number}`,
    metadata: {
      githubEvent: "issue_comment",
      githubAction: payload.action,
      issueId: issue.id,
      issueNumber: issue.number,
      issueTitle: issue.title,
      commentId: comment.id,
      url: comment.html_url,
    },
  }
}

function normalizePushActivity(
  payload: GitHubWebhookPayload,
  ctx: WebhookCtx
): ReturnType<typeof normalizeRepoActivityEvent> {
  const branch = payload.ref?.replace(/^refs\/heads\//, "") ?? "a branch"
  const commits = payload.commits?.length ?? 0
  const head = payload.after ?? payload.head_commit?.id ?? null
  const before = payload.before ?? null
  const repoUrl = `https://github.com/${ctx.repoFullName}`
  const url =
    head && before ? `${repoUrl}/compare/${before}...${head}` : repoUrl

  return {
    action: "github_push",
    severity: "info",
    description: `${commits} commit${commits === 1 ? "" : "s"} to ${branch}`,
    targetGithubUsername: ctx.senderLogin,
    targetGithubUserId: ctx.senderId,
    githubRef: head ? head.slice(0, 7) : null,
    metadata: {
      githubEvent: "push",
      branch,
      commits,
      before,
      head,
      forced: payload.forced === true,
      url,
    },
  }
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: { POST: handler },
  },
})
