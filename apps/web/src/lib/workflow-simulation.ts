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
      publicNonForkRepos,
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
        publicNonForkRepoCount: publicNonForkRepos,
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
          publicNonForkRepos: publicNonForkRepos,
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

/** Graph walk matching workflowsRouter.runReport (server-side). */
export function simulateWorkflowDefinition(
  wf: { id: string; name: string; definition: unknown },
  userData: RunReportUserData
): SingleWorkflowSimResult {
  const def = wf.definition as {
    nodes: Array<Record<string, unknown>>
    edges: Array<Record<string, unknown>>
  }
  const nodes = def.nodes ?? []
  const edges = def.edges ?? []

  const nodeMap = new Map(nodes.map((n) => [n.id as string, n]))
  const outgoing = new Map<string, Array<Record<string, unknown>>>()
  for (const e of edges) {
    const src = e.source as string
    if (!outgoing.has(src)) outgoing.set(src, [])
    outgoing.get(src)!.push(e)
  }

  const outcomes: Array<{
    nodeId: string
    type: string
    label: string
    status: string
    detail: string
  }> = []
  const nodeOutcome = new Map<string, boolean>()
  const triggers = nodes.filter((n) => n.type === "trigger")
  const queue = triggers.map((n) => n.id as string)
  const visited = new Set<string>()

  for (const t of triggers) {
    outcomes.push({
      nodeId: t.id as string,
      type: "trigger",
      label:
        ((t.data as Record<string, unknown>)?.trigger as string) ?? "trigger",
      status: "executed",
      detail: "Triggered",
    })
    nodeOutcome.set(t.id as string, true)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    const outs = outgoing.get(current) ?? []
    for (const edge of outs) {
      const targetId = edge.target as string
      const targetNode = nodeMap.get(targetId)
      if (!targetNode || visited.has(targetId)) continue
      const sourceOutcome = nodeOutcome.get(current)
      const sourceHandle = edge.sourceHandle as string | undefined
      const sourceNode = nodeMap.get(current)
      if (
        sourceNode &&
        (sourceNode.type === "rule" || sourceNode.type === "condition")
      ) {
        if (sourceHandle === "pass" && sourceOutcome === false) continue
        if (sourceHandle === "fail" && sourceOutcome === true) continue
        if (sourceHandle === "true" && sourceOutcome === false) continue
        if (sourceHandle === "false" && sourceOutcome === true) continue
      }

      let pass = true
      let detail = ""
      const data = (targetNode.data as Record<string, unknown>) ?? {}
      const ud = userData?.data ?? {}

      if (targetNode.type === "rule") {
        const rule = data.rule as string
        const params = data.params as Record<string, unknown> | undefined
        if (rule === "accountAge") {
          pass =
            ((ud.accountAgeDays as number) ?? 0) >=
            ((params?.days as number) ?? 30)
          detail = `Account ${ud.accountAgeDays}d (need ${(params?.days as number) ?? 30}d)`
        } else if (rule === "minMergedPrs") {
          pass =
            ((ud.mergedPrs as number) ?? 0) >= ((params?.count as number) ?? 15)
          detail = `${ud.mergedPrs} merged PRs (need ${(params?.count as number) ?? 15})`
        } else if (rule === "repoActivityMinimum") {
          pass =
            ((ud.publicNonForkRepos as number) ?? 0) >=
            ((params?.minRepos as number) ?? 3)
          detail = `${ud.publicNonForkRepos} repos (need ${(params?.minRepos as number) ?? 3})`
        } else if (rule === "requireProfileReadme") {
          pass = Boolean(ud.hasProfileReadme)
          detail = pass ? "README exists" : "No README"
        } else if (rule === "contributorScore") {
          pass =
            ((ud.score as number) ?? 0) >= ((params?.minScore as number) ?? 50)
          detail = `Score ${ud.score} (need ${(params?.minScore as number) ?? 50})`
        } else {
          pass = true
          detail = "No simulation data"
        }
      } else if (targetNode.type === "condition") {
        const field = data.field as string
        const op = data.operator as string
        const val = Number.parseFloat(String(data.value))
        const actual = (ud[field] as number) ?? 0
        if (op === ">") pass = actual > val
        else if (op === ">=") pass = actual >= val
        else if (op === "<") pass = actual < val
        else if (op === "<=") pass = actual <= val
        else if (op === "==") pass = actual === val
        else if (op === "!=") pass = actual !== val
        detail = `${field} is ${actual} (${op} ${val})`
      } else if (targetNode.type === "logic") {
        const gate = data.gate as string
        const incoming = edges.filter((e) => e.target === targetId)
        const inputs = incoming
          .map((e) => nodeOutcome.get(e.source as string))
          .filter((v) => v !== undefined) as boolean[]
        if (gate === "AND") pass = inputs.length > 0 && inputs.every(Boolean)
        else if (gate === "OR") pass = inputs.some(Boolean)
        else if (gate === "NOT") pass = inputs.length > 0 && !inputs[0]
        detail = `${gate}(${inputs.map((r) => (r ? "T" : "F")).join(", ")})`
      } else if (targetNode.type === "action") {
        detail = `Would: ${data.action as string}`
        if (data.message) detail += ` — "${data.message}"`
      } else {
        detail = "Processed"
      }

      const status =
        targetNode.type === "action" ? "executed" : pass ? "pass" : "fail"
      outcomes.push({
        nodeId: targetId,
        type: targetNode.type as string,
        label:
          (data.rule as string) ??
          (data.action as string) ??
          (data.gate as string) ??
          (targetNode.type as string),
        status,
        detail,
      })
      nodeOutcome.set(targetId, pass)
      queue.push(targetId)
    }
  }

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
