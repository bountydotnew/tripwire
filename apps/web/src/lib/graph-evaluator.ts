import type { Node, Edge } from "@xyflow/react"
import {
  executeWorkflow,
  type ExecutionStep,
  type ForceMode,
} from "@tripwire/core/workflow-executor"

export type SimMode = "pass" | "fail" | "user"

export interface SimNodeResult {
  nodeId: string
  edgeId?: string
  status: "pass" | "fail" | "skipped" | "executed"
  detail?: string
  pauseMs?: number
}

export interface SimUserData {
  accountAgeDays: number
  followers: number
  following: number
  publicRepos: number
  publicNonForkRepos: number
  publicGists: number
  hasProfileReadme: boolean
  mergedPrs: number
  score: number
  filesChanged?: number
  username?: string
}

export function simulateWorkflow(
  nodes: Node[],
  edges: Edge[],
  mode: SimMode,
  context: Record<string, unknown>,
  _actionLabels: Record<string, string>
): SimNodeResult[] {
  const forceMode: ForceMode =
    mode === "pass" ? "pass" : mode === "fail" ? "fail" : null

  const wfNodes = nodes.map((n) => ({
    id: n.id,
    type: n.type as string,
    data: n.data as Record<string, unknown>,
  }))

  const wfEdges = edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
  }))

  const steps = executeWorkflow(wfNodes, wfEdges, context, forceMode)

  return steps.map(
    (step: ExecutionStep): SimNodeResult => ({
      nodeId: step.nodeId,
      edgeId: step.edgeId,
      status: step.status,
      detail: step.detail,
      pauseMs: step.pauseMs,
    })
  )
}

export function workflowSupportsManualRun(wf: {
  definition: unknown
}): boolean {
  const def = wf.definition as {
    nodes?: Array<{ type: string; data?: Record<string, unknown> }>
  }
  const nodes = def.nodes ?? []
  return nodes.some((n) => n.type === "trigger" && n.data?.trigger === "manual")
}
