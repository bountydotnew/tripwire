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
} from "#/lib/github/webhook"
import {
  markGitHubRevalidationSignals,
  markGitHubWebhookEventFailed,
  markGitHubWebhookEventProcessed,
  recordGitHubWebhookEvent,
} from "#/lib/github/cache"
import { getGitHubWebhookRevalidationSignalKeys } from "#/lib/github/revalidation"
import { broadcastSignalKeys } from "@tripwire/github/signal-broker"

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
  const payload = JSON.parse(body)
  console.log("[Webhook] Event:", event, "| Action:", payload.action)

  // Idempotency: GitHub retries reuse the same X-GitHub-Delivery UUID.
  // Insert-or-ignore against `github_webhook_event` — if the row already
  // existed, this is a retry and we ACK without re-running the pipeline.
  // (Without `deliveryId` we can't dedupe; fall through and process.)
  const signalKeys =
    event ? getGitHubWebhookRevalidationSignalKeys(event, payload) : []
  let recordedNewEvent = true
  if (deliveryId && event) {
    try {
      recordedNewEvent = await recordGitHubWebhookEvent({
        deliveryId,
        event,
        signalKeys,
      })
    } catch (err) {
      console.error("[Webhook] failed to record delivery:", err)
      // Fail open: better to process twice than to silently drop the webhook.
    }
    if (!recordedNewEvent) {
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
    if (deliveryId) {
      try {
        await markGitHubWebhookEventProcessed(deliveryId)
      } catch (err) {
        console.error("[Webhook] failed to mark processed:", err)
      }
    }
    return new Response("No installation", { status: 200 })
  }

  try {
    if (event === "installation") {
      await handleInstallation(payload)
    } else if (event === "installation_repositories") {
      await handleInstallationRepositories(payload)
    } else {
      const repo = payload.repository
      if (!repo) {
        if (deliveryId) {
          try {
            await markGitHubWebhookEventProcessed(deliveryId)
          } catch (err) {
            console.error("[Webhook] failed to mark processed:", err)
          }
        }
        return new Response("OK", { status: 200 })
      }

      const ctx = {
        installationId,
        repoFullName: repo.full_name,
        githubRepoId: repo.id,
        senderLogin: payload.sender?.login ?? "",
        senderId: payload.sender?.id ?? 0,
      }

      await handleRepoEvent(event, payload, ctx, repo)
    }

    if (deliveryId) {
      try {
        await markGitHubWebhookEventProcessed(deliveryId)
      } catch (err) {
        console.error("[Webhook] failed to mark processed:", err)
      }
    }
  } catch (err) {
    console.error("Webhook handler error:", err)
    if (deliveryId) {
      try {
        await markGitHubWebhookEventFailed(
          deliveryId,
          err instanceof Error ? err.message : String(err),
        )
      } catch (logErr) {
        console.error("[Webhook] failed to record processing error:", logErr)
      }
    }
  }

  return new Response("OK", { status: 200 })
}

type WebhookCtx = {
  installationId: number
  repoFullName: string
  githubRepoId: number
  senderLogin: string
  senderId: number
}

async function handleRepoEvent(
  event: string | null,
  // biome-ignore lint/suspicious/noExplicitAny: webhook payload is dynamically shaped
  payload: any,
  ctx: WebhookCtx,
  // biome-ignore lint/suspicious/noExplicitAny: webhook payload is dynamically shaped
  repo: any,
): Promise<void> {
  // Extracted from the inline switch so the outer handler's try/catch can
  // wrap both this and the installation branches uniformly. Behavior is
  // identical to the prior inline form.
  switch (event) {
    case "pull_request": {
      if (payload.action === "opened" || payload.action === "reopened") {
        const prContent = `${payload.pull_request.title ?? ""}\n${payload.pull_request.body ?? ""}`
        const [repoRow] = await db
          .select({ id: repositories.id })
          .from(repositories)
          .where(eq(repositories.githubRepoId, repo.id))

        if (repoRow) {
          const bountyHit = await checkFakeBountyReference(
            repoRow.id,
            prContent
          )
          if (bountyHit) {
            await handleFakeBountyCatch({
              repoId: repoRow.id,
              bountyId: bountyHit.bountyId,
              githubUsername: ctx.senderLogin,
              githubUserId: ctx.senderId,
              githubRef: `#${payload.pull_request.number}`,
              refType: "pr",
              prNumber: payload.pull_request.number,
              installationId: ctx.installationId,
              repoFullName: ctx.repoFullName,
            })
            break
          }
        }

        await handlePullRequest(
          ctx,
          payload.pull_request.number,
          payload.pull_request.title,
          payload.pull_request.body ?? undefined
        )
      }
      break
    }

    case "issues": {
      if (payload.action === "opened" || payload.action === "reopened") {
        await handleIssue(
          ctx,
          payload.issue.number,
          payload.issue.title,
          payload.issue.body ?? undefined
        )
      }
      break
    }

    case "issue_comment": {
      if (payload.sender?.type === "Bot") break
      if (payload.action === "created") {
        await handleComment(
          ctx,
          payload.comment.id,
          payload.issue.number,
          payload.comment.body ?? undefined
        )
      }
      break
    }
  }
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: { POST: handler },
  },
})
