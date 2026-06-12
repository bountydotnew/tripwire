import { createFileRoute } from "@tanstack/react-router"
import { verifyWebhookSignature } from "@tripwire/github"
import {
  handlePullRequest,
  handleIssue,
  handleComment,
  checkFakeBountyReference,
  handleFakeBountyCatch,
} from "@tripwire/core"
// Side-effect import: registers the reputation-update → rescore hook so
// `updateReputation` calls from any webhook in this process fan out to the
// background scorer.
import "#/inngest/score-user"
import { db } from "@tripwire/db/client"
import { repositories } from "@tripwire/db"
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
import { broadcastSignalKeys } from "@tripwire/github/signal-broker"

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
  pull_request?: { number: number; title: string; body?: string | null }
  issue?: { number: number; title: string; body?: string | null }
  comment?: { id: number; body?: string | null }
}

function isInstallationPayload(
  p: GitHubWebhookPayload
): p is GitHubWebhookPayload & InstallationPayload {
  const inst = p.installation
  const sender = p.sender
  const account = inst?.account
  return (
    typeof p.action === "string" &&
    typeof inst?.id === "number" &&
    typeof account?.id === "number" &&
    typeof account.login === "string" &&
    typeof account.type === "string" &&
    typeof account.avatar_url === "string" &&
    typeof sender?.id === "number" &&
    typeof sender.login === "string"
  )
}

function isInstallationReposPayload(
  p: GitHubWebhookPayload
): p is GitHubWebhookPayload & InstallationReposPayload {
  return (
    (p.action === "added" || p.action === "removed") &&
    typeof p.installation?.id === "number"
  )
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
    console.error("[Webhook] failed to mark processed:", err)
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
    console.error("[Webhook] failed to record processing error:", logErr)
  }
}

async function handler({ request }: { request: Request }) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET
  if (!secret) {
    console.error("[Webhook] GITHUB_WEBHOOK_SECRET is not configured")
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
  console.log("[Webhook] Event:", event, "| Action:", payload.action)

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
      console.error(
        "[Webhook] failed to record delivery, processing anyway:",
        err
      )
    }
    if (!isNewDelivery) {
      console.log("[Webhook] duplicate delivery, skipping:", deliveryId)
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
      console.error("[Webhook] mark signals failed:", err)
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
        console.warn("[Webhook] installation payload missing required fields")
      }
    } else if (event === "installation_repositories") {
      if (isInstallationReposPayload(payload)) {
        await handleInstallationRepositories(payload)
      } else {
        console.warn("[Webhook] installation_repositories payload invalid")
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
    console.error("Webhook handler error:", err)
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
  switch (event) {
    case "pull_request": {
      const pr = payload.pull_request
      if (
        !pr ||
        (payload.action !== "opened" && payload.action !== "reopened")
      ) {
        break
      }
      const prContent = `${pr.title}\n${pr.body ?? ""}`
      const [repoRow] = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(eq(repositories.githubRepoId, repo.id))

      if (repoRow) {
        const bountyHit = await checkFakeBountyReference(repoRow.id, prContent)
        if (bountyHit) {
          await handleFakeBountyCatch({
            repoId: repoRow.id,
            bountyId: bountyHit.bountyId,
            githubUsername: ctx.senderLogin,
            githubUserId: ctx.senderId,
            githubRef: `#${pr.number}`,
            refType: "pr",
            prNumber: pr.number,
            installationId: ctx.installationId,
            repoFullName: ctx.repoFullName,
          })
          break
        }
      }

      await handlePullRequest(ctx, pr.number, pr.title, pr.body ?? undefined)
      break
    }

    case "issues": {
      const issue = payload.issue
      if (
        !issue ||
        (payload.action !== "opened" && payload.action !== "reopened")
      ) {
        break
      }
      await handleIssue(ctx, issue.number, issue.title, issue.body ?? undefined)
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
      break
    }
  }
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: { POST: handler },
  },
})
