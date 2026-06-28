import { eq } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { organizations, repositories } from "@tripwire/db"
import {
  closeIssue,
  closePullRequest,
  deleteComment,
  getInstallationToken,
} from "@tripwire/github"

interface RemovableItem {
  repoId: string
  contentType: string | null
  githubRef: string | null
}

/**
 * Act on the GitHub side of a flagged content item from the review queue:
 * close the PR/issue, or delete the comment. Resolves the installation token
 * and repo `owner/name` from the item's repo. Throws (with a human message)
 * when the item carries no actionable GitHub reference.
 */
export async function removeFlaggedContent(item: RemovableItem): Promise<void> {
  if (!item.githubRef || !item.contentType) {
    throw new Error("This item has no GitHub content to remove.")
  }

  const [row] = await db
    .select({
      fullName: repositories.fullName,
      installationId: organizations.githubInstallationId,
    })
    .from(repositories)
    .innerJoin(organizations, eq(organizations.id, repositories.orgId))
    .where(eq(repositories.id, item.repoId))
    .limit(1)

  if (!row?.installationId) {
    throw new Error(
      "This repo is no longer connected to a GitHub installation."
    )
  }

  const [owner, repo] = row.fullName.split("/")
  const token = await getInstallationToken(row.installationId)

  if (item.contentType === "comment") {
    const match = item.githubRef.match(/comment\/(\d+)/)
    if (!match) throw new Error("Malformed comment reference.")
    await deleteComment(token, owner, repo, Number(match[1]))
    return
  }

  const numberMatch = item.githubRef.match(/#(\d+)/)
  if (!numberMatch) throw new Error("Malformed content reference.")
  const number = Number(numberMatch[1])

  if (item.contentType === "pull_request") {
    await closePullRequest(token, owner, repo, number)
  } else if (item.contentType === "issue") {
    await closeIssue(token, owner, repo, number)
  } else {
    throw new Error(`Unsupported content type: ${item.contentType}`)
  }
}
