import { and, eq, sql } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { blacklistEntries, whitelistEntries } from "@tripwire/db"
import {
  addComment,
  closeIssue,
  closePullRequest,
  getInstallationToken,
  githubApi,
} from "@tripwire/github"
import { logEvent } from "@tripwire/core"

export interface WorkflowActionNode {
  nodeId: string
  data: Record<string, unknown>
}

export interface EnforceArgs {
  installationId: number
  repoFullName: string
  repoId: string
  kind: "pr" | "issue"
  /** PR or issue number. */
  number: number
  username: string
  userId?: number
  actionNodes: WorkflowActionNode[]
}

export interface PerformedAction {
  nodeId: string
  action: string
  performed: boolean
  detail: string
}

function nodeText(data: Record<string, unknown>): string | undefined {
  return (
    (data.comment as string | undefined) ?? (data.message as string | undefined)
  )
}

/**
 * Perform the real GitHub / list effects for a workflow's reached action nodes.
 * Only runs for workflows in enforce mode. Each action is best-effort and its
 * outcome is recorded so the workflow_run captures what actually happened.
 * Integration actions (slack/discord/webhook/request_review) are not yet
 * wired and are recorded as unsupported.
 */
export async function performWorkflowActions(
  args: EnforceArgs
): Promise<PerformedAction[]> {
  const [owner, repo] = args.repoFullName.split("/")
  const results: PerformedAction[] = []
  let token: string | null = null
  const ghToken = async () =>
    (token ??= await getInstallationToken(args.installationId))

  for (const node of args.actionNodes) {
    const action = (node.data.action as string | undefined) ?? "log"
    try {
      switch (action) {
        case "block":
        case "close": {
          const t = await ghToken()
          const comment = nodeText(node.data)
          if (args.kind === "pr") {
            await closePullRequest(t, owner, repo, args.number, comment)
          } else {
            await closeIssue(t, owner, repo, args.number, comment)
          }
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: `closed #${args.number}`,
          })
          break
        }
        case "warn":
        case "comment": {
          const t = await ghToken()
          const body = nodeText(node.data) ?? "Flagged by a Tripwire workflow."
          await addComment(t, owner, repo, args.number, body)
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: `commented on #${args.number}`,
          })
          break
        }
        case "label": {
          const t = await ghToken()
          const label = (node.data.label as string | undefined) ?? "tripwire"
          await githubApi(
            `/repos/${owner}/${repo}/issues/${args.number}/labels`,
            t,
            { method: "POST", body: JSON.stringify({ labels: [label] }) }
          )
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: `labeled #${args.number} "${label}"`,
          })
          break
        }
        case "add_to_whitelist":
        case "add_to_blacklist": {
          const table =
            action === "add_to_whitelist" ? whitelistEntries : blacklistEntries
          const opposite =
            action === "add_to_whitelist" ? blacklistEntries : whitelistEntries
          await db
            .delete(opposite)
            .where(
              and(
                eq(opposite.repoId, args.repoId),
                sql`lower(${opposite.githubUsername}) = ${args.username.toLowerCase()}`
              )
            )
          await db
            .insert(table)
            .values({
              repoId: args.repoId,
              githubUsername: args.username,
              githubUserId: args.userId ?? null,
            })
            .onConflictDoNothing()
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: `@${args.username}`,
          })
          break
        }
        case "remove_from_whitelist":
        case "remove_from_blacklist": {
          const table =
            action === "remove_from_whitelist"
              ? whitelistEntries
              : blacklistEntries
          await db
            .delete(table)
            .where(
              and(
                eq(table.repoId, args.repoId),
                sql`lower(${table.githubUsername}) = ${args.username.toLowerCase()}`
              )
            )
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: `@${args.username}`,
          })
          break
        }
        case "log": {
          await logEvent({
            repoId: args.repoId,
            action: "workflow_run",
            severity: "info",
            description: `Workflow logged @${args.username}`,
            targetGithubUsername: args.username,
            targetGithubUserId: args.userId,
            githubRef: `#${args.number}`,
          })
          results.push({
            nodeId: node.nodeId,
            action,
            performed: true,
            detail: "logged",
          })
          break
        }
        default:
          results.push({
            nodeId: node.nodeId,
            action,
            performed: false,
            detail: "unsupported action",
          })
      }
    } catch (err) {
      results.push({
        nodeId: node.nodeId,
        action,
        performed: false,
        detail: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return results
}
