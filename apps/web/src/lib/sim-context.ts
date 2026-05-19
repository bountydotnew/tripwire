import type { Node, Edge } from "@xyflow/react"
import {
  getEvaluatorForNode,
  type ContextField,
} from "@tripwire/core/node-evaluators"

export interface SimInput {
  key: string
  label: string
  type: "number" | "string" | "boolean"
  source: "user" | "content" | "manual"
  nodeType: string
  nodeIds: string[]
}

export function collectSimInputs(nodes: Node[], edges: Edge[]): SimInput[] {
  const inputMap = new Map<string, SimInput>()
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  const triggers = nodes.filter((n) => n.type === "trigger")
  const visited = new Set<string>()
  const queue = triggers.map((n) => n.id)
  const orderedNodeIds: string[] = [...queue]

  const outgoing = new Map<string, Edge[]>()
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, [])
    outgoing.get(e.source)!.push(e)
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current)) continue
    visited.add(current)
    for (const edge of outgoing.get(current) ?? []) {
      if (!visited.has(edge.target)) {
        orderedNodeIds.push(edge.target)
        queue.push(edge.target)
      }
    }
  }

  for (const nodeId of orderedNodeIds) {
    const node = nodeMap.get(nodeId)
    if (!node) continue

    const evaluator = getEvaluatorForNode(
      node.type as string,
      node.data as Record<string, unknown>
    )
    if (!evaluator) continue

    let fields: ContextField[] = evaluator.requiredContext

    if (node.type === "condition") {
      const field = (node.data as Record<string, unknown>).field as string
      if (field && !inputMap.has(field)) {
        fields = [
          ...fields,
          {
            key: field,
            label: fieldLabel(field),
            type: "number",
            source: "user",
          },
        ]
      }
    }

    for (const field of fields) {
      const existing = inputMap.get(field.key)
      if (existing) {
        if (!existing.nodeIds.includes(nodeId)) {
          existing.nodeIds.push(nodeId)
        }
      } else {
        inputMap.set(field.key, {
          key: field.key,
          label: field.label,
          type: field.type,
          source: field.source,
          nodeType: node.type as string,
          nodeIds: [nodeId],
        })
      }
    }
  }

  const inputs = Array.from(inputMap.values())
  inputs.sort((a, b) => {
    const sourceOrder = { user: 0, content: 1, manual: 2 }
    return (sourceOrder[a.source] ?? 3) - (sourceOrder[b.source] ?? 3)
  })

  return inputs
}

function fieldLabel(field: string): string {
  const labels: Record<string, string> = {
    score: "Contributor score",
    accountAgeDays: "Account age (days)",
    publicRepos: "Public repos",
    publicNonForkRepos: "Non-fork repos",
    followers: "Followers",
    following: "Following",
    publicGists: "Public gists",
    mergedPrs: "Merged PRs",
    hasProfileReadme: "Has profile README",
    filesChanged: "Files changed",
    username: "Username",
    contentText: "Content text",
  }
  return labels[field] ?? field
}
