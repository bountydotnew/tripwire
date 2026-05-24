import { and, eq, sql } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import {
  events,
  organizations,
  repositories,
  type WorkflowDefinition,
} from "@tripwire/db"
import {
  fetchUserAchievements,
  fetchUserGraphQL,
  getInstallationToken,
  getMergedPrCount,
  getPublicNonForkRepoCount,
  getUser,
  githubApi,
  hasProfileReadme,
} from "@tripwire/github"
import { computeContributorScore } from "@tripwire/core"
import { executeWorkflow } from "@tripwire/core/workflow-executor"

export type RunReportUserData = {
  user: { login: string; avatarUrl: string; name: string | null }
  data: Record<string, unknown>
} | null

export type SingleWorkflowSimResult = {
  workflowId: string
  workflowName: string
  nodeCount: number
  result: "blocked" | "allowed" | "no-action"
  outcomes: Array<{
    nodeId: string
    type: string
    label: string
    status: string
    detail: string
  }>
  actions: string[]
}

/** Load GitHub-backed user payload + optional issue/PR body text for workflow rules. */
export async function fetchWorkflowRunContext(input: {
  repoId: string
  username: string
  ref?: string
  kind?: "user" | "pr" | "issue"
}): Promise<{
  userData: RunReportUserData
  contentText: string | null
  contentMeta: {
    title: string
    number: number
    url: string
    state: string
  } | null
}> {
  let token: string | null = null
  try {
    const [repo] = await db
      .select({ orgId: repositories.orgId })
      .from(repositories)
      .where(eq(repositories.id, input.repoId))
      .limit(1)
    if (repo) {
      const [org] = await db
        .select({ installationId: organizations.githubInstallationId })
        .from(organizations)
        .where(eq(organizations.id, repo.orgId))
        .limit(1)
      if (org) token = await getInstallationToken(org.installationId)
    }
  } catch {
    /* fall back */
  }

  let userData: RunReportUserData = null

  if (token) {
    const [
      ghUser,
      mergedPrs,
      nonForkRepos,
      profileReadme,
      graphqlData,
      achievements,
      repoEvents,
    ] = await Promise.all([
      getUser(token, input.username).catch(() => null),
      getMergedPrCount(token, input.username).catch(() => 0),
      getPublicNonForkRepoCount(token, input.username).catch(() => 0),
      hasProfileReadme(token, input.username).catch(() => false),
      fetchUserGraphQL(token, input.username).catch(() => null),
      fetchUserAchievements(input.username).catch(() => []),
      db
        .select()
        .from(events)
        .where(
          and(
            eq(events.repoId, input.repoId),
            sql`lower(${events.targetGithubUsername}) = ${input.username.toLowerCase()}`
          )
        ),
    ])

    if (ghUser) {
      const createdAt = new Date(
        (ghUser as Record<string, unknown>).created_at as string
      )
      const accountAgeDays = Math.floor(
        (Date.now() - createdAt.getTime()) / 86_400_000
      )
      const blockedCount = repoEvents.filter(
        (e) => e.action === "pipeline_blocked"
      ).length
      const allowedCount = repoEvents.filter(
        (e) => e.action === "pipeline_allowed"
      ).length

      const score = computeContributorScore({
        accountAgeDays,
        followers:
          ((ghUser as Record<string, unknown>).followers as number) ?? 0,
        following:
          ((ghUser as Record<string, unknown>).following as number) ?? 0,
        publicRepos:
          ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
        publicNonForkRepoCount: nonForkRepos,
        publicForkRepoCount: 0,
        contextRepoPrCount: 0,
        publicGists:
          ((ghUser as Record<string, unknown>).public_gists as number) ?? 0,
        bio: ((ghUser as Record<string, unknown>).bio as string) ?? null,
        company:
          ((ghUser as Record<string, unknown>).company as string) ?? null,
        location:
          ((ghUser as Record<string, unknown>).location as string) ?? null,
        blog: ((ghUser as Record<string, unknown>).blog as string) ?? null,
        twitterUsername:
          ((ghUser as Record<string, unknown>).twitter_username as string) ??
          null,
        hasTwoFactor:
          ((ghUser as Record<string, unknown>)
            .two_factor_authentication as boolean) ?? false,
        hasProfileReadme: profileReadme,
        graphql: graphqlData,
        achievements,
        mergedPrCount: mergedPrs,
        closedPrCount: 0,
        closedUnmergedPrCount: 0,
        blockedCount,
        allowedCount,
        nearMissCount: 0,
      })

      userData = {
        user: {
          login: (ghUser as Record<string, unknown>).login as string,
          avatarUrl: (ghUser as Record<string, unknown>).avatar_url as string,
          name: (ghUser as Record<string, unknown>).name as string | null,
        },
        data: {
          accountAgeDays,
          followers:
            ((ghUser as Record<string, unknown>).followers as number) ?? 0,
          publicRepos:
            ((ghUser as Record<string, unknown>).public_repos as number) ?? 0,
          nonForkRepos,
          hasProfileReadme: profileReadme,
          mergedPrs,
          score: score.total,
        },
      }
    }
  }

  let contentText: string | null = null
  let contentMeta: {
    title: string
    number: number
    url: string
    state: string
  } | null = null

  if (token && input.ref && input.kind && input.kind !== "user") {
    try {
      const [repoRow] = await db
        .select({ fullName: repositories.fullName })
        .from(repositories)
        .where(eq(repositories.id, input.repoId))
        .limit(1)
      if (repoRow) {
        const [owner, repoName] = repoRow.fullName.split("/")
        const num = Number.parseInt(input.ref.replace("#", ""), 10)
        if (!Number.isNaN(num) && owner && repoName) {
          if (input.kind === "pr") {
            const pr = await githubApi(
              `/repos/${owner}/${repoName}/pulls/${num}`,
              token
            ).catch(() => null)
            if (pr) {
              contentText = [pr.title, pr.body].filter(Boolean).join("\n\n")
              contentMeta = {
                title: pr.title as string,
                number: num,
                url: pr.html_url as string,
                state: pr.merged_at ? "merged" : (pr.state as string),
              }
            }
          } else if (input.kind === "issue") {
            const issue = await githubApi(
              `/repos/${owner}/${repoName}/issues/${num}`,
              token
            ).catch(() => null)
            if (issue) {
              contentText = [issue.title, issue.body]
                .filter(Boolean)
                .join("\n\n")
              contentMeta = {
                title: issue.title as string,
                number: num,
                url: issue.html_url as string,
                state: issue.state as string,
              }
            }
          }
        }
      }
    } catch {
      /* content optional */
    }
  }

  return {
    userData,
    contentText: contentText ? contentText.slice(0, 500) : null,
    contentMeta,
  }
}

function workflowDefinitionHasManualTrigger(def: WorkflowDefinition): boolean {
  const nodes = def.nodes ?? []
  return nodes.some(
    (n) =>
      n.type === "trigger" &&
      (n.data?.trigger as string | undefined) === "manual"
  )
}

export function workflowSupportsManualRun(wf: {
  definition: unknown
}): boolean {
  const def = wf.definition as WorkflowDefinition
  return workflowDefinitionHasManualTrigger(def)
}

function actionLabel(data: Record<string, unknown>): string {
  return (
    (data.action as string) ??
    (data.rule as string) ??
    (data.gate as string) ??
    (data.trigger as string) ??
    "node"
  )
}

/**
 * Runs the workflow through @tripwire/core's executeWorkflow — same path the
 * client test button uses, same evaluators the .test.ts files exercise. The
 * test button and the server run report now share one source of truth.
 */
export function simulateWorkflowDefinition(
  wf: { id: string; name: string; definition: unknown },
  userData: RunReportUserData,
  contentText?: string | null
): SingleWorkflowSimResult {
  const def = wf.definition as {
    nodes: Array<{
      id: string
      type: string
      data?: Record<string, unknown>
    }>
    edges: Array<{
      id: string
      source: string
      target: string
      sourceHandle?: string | null
    }>
  }
  const nodes = (def.nodes ?? []).map((n) => ({
    id: n.id,
    type: n.type,
    data: n.data ?? {},
  }))
  const edges = (def.edges ?? []).map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? null,
  }))

  const ctx: Record<string, unknown> = {
    ...(userData?.data ?? {}),
  }
  if (contentText !== undefined && contentText !== null) {
    ctx.contentText = contentText
  }

  const steps = executeWorkflow(nodes, edges, ctx)
  const nodeById = new Map(nodes.map((n) => [n.id, n]))

  const outcomes = steps.map((step) => {
    const node = nodeById.get(step.nodeId)
    const data = node?.data ?? {}
    return {
      nodeId: step.nodeId,
      type: step.type,
      label: actionLabel(data),
      status: step.status,
      detail: step.detail,
    }
  })

  const actions = outcomes.filter((o) => o.type === "action")
  const hasBlock = actions.some(
    (a) => a.label === "block" || a.detail.includes("block")
  )

  return {
    workflowId: wf.id,
    workflowName: wf.name,
    nodeCount: nodes.length,
    result: hasBlock ? "blocked" : actions.length > 0 ? "allowed" : "no-action",
    outcomes,
    actions: actions.map((a) => a.detail),
  }
}
