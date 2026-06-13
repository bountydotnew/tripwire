import { eq } from "drizzle-orm"
import { createError } from "evlog"
import { createLogger } from "@tripwire/logger"
import { db } from "@tripwire/db/client"
import { organizations, repositories } from "@tripwire/db"
import { getInstallationToken } from "@tripwire/github"
import { registerReputationUpdateHook } from "@tripwire/core"
import { inngest } from "./client"
import { scoreSingleContributor } from "./visibility-helpers"

const logger = createLogger("score-user")

export const scoreUser = inngest.createFunction(
  {
    id: "score-user",
    triggers: [{ event: "visibility/score-user.requested" }],
    debounce: {
      key: "event.data.repoId + '/' + event.data.username",
      period: "30s",
    },
    concurrency: {
      key: "event.data.repoId + '/' + event.data.username",
      limit: 1,
    },
    retries: 1,
  },
  async ({ event, step }) => {
    const { repoId, username } = event.data as {
      repoId: string
      username: string
    }

    const token = await step.run("get-token", async () => {
      const [row] = await db
        .select({ installationId: organizations.githubInstallationId })
        .from(repositories)
        .innerJoin(organizations, eq(organizations.id, repositories.orgId))
        .where(eq(repositories.id, repoId))
        .limit(1)
      if (!row) {
        throw createError({
          code: "visibility.repo_not_found",
          status: 404,
          message: `repo ${repoId} not found`,
          internal: { repoId },
        })
      }
      return getInstallationToken(row.installationId)
    })

    try {
      const score = await step.run("score", () =>
        scoreSingleContributor(repoId, username, token)
      )
      return { repoId, username, score }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      logger.warn("scoring skipped", { username, repoId, reason: msg })
      return { repoId, username, score: null, skipped: true }
    }
  }
)

registerReputationUpdateHook(({ repoId, username }) => {
  inngest
    .send({
      name: "visibility/score-user.requested",
      data: { repoId, username },
    })
    .catch((err) => {
      logger.warn("failed to enqueue", err)
    })
})
