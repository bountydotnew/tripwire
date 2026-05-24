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
  const payload = JSON.parse(body)
  console.log("[Webhook] Event:", event, "| Action:", payload.action)

  const installationId = payload.installation?.id
  if (!installationId) {
    return new Response("No installation", { status: 200 })
  }

  if (event === "installation") {
    try {
      await handleInstallation(payload)
    } catch (err) {
      console.error("[Webhook] installation handler error:", err)
    }
    return new Response("OK", { status: 200 })
  }

  if (event === "installation_repositories") {
    try {
      await handleInstallationRepositories(payload)
    } catch (err) {
      console.error("[Webhook] installation_repositories handler error:", err)
    }
    return new Response("OK", { status: 200 })
  }

  const repo = payload.repository
  if (!repo) return new Response("OK", { status: 200 })

  const ctx = {
    installationId,
    repoFullName: repo.full_name,
    githubRepoId: repo.id,
    senderLogin: payload.sender?.login ?? "",
    senderId: payload.sender?.id ?? 0,
  }

  try {
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
  } catch (err) {
    console.error("Webhook handler error:", err)
  }

  return new Response("OK", { status: 200 })
}

export const Route = createFileRoute("/api/github/webhook")({
  server: {
    handlers: { POST: handler },
  },
})
