import type { Node, Edge } from "@xyflow/react"

export interface EditorSnapshot {
  nodes: Node[]
  edges: Edge[]
}

export function buildChangeSummary(
  before: EditorSnapshot,
  after: EditorSnapshot
): string {
  const addedNodes = after.nodes.filter(
    (n) => !before.nodes.some((bn) => bn.id === n.id)
  ).length
  const removedNodes = before.nodes.filter(
    (n) => !after.nodes.some((an) => an.id === n.id)
  ).length
  const addedEdges = after.edges.filter(
    (e) => !before.edges.some((be) => be.id === e.id)
  ).length
  const removedEdges = before.edges.filter(
    (e) => !after.edges.some((ae) => ae.id === e.id)
  ).length

  const editedNodes = after.nodes.filter((n) => {
    const prev = before.nodes.find((bn) => bn.id === n.id)
    if (!prev) return false
    return JSON.stringify(prev.data) !== JSON.stringify(n.data)
  }).length

  const parts: string[] = []
  if (addedNodes)
    parts.push(`${addedNodes} node${addedNodes > 1 ? "s" : ""} added`)
  if (removedNodes)
    parts.push(`${removedNodes} node${removedNodes > 1 ? "s" : ""} removed`)
  if (editedNodes)
    parts.push(`${editedNodes} node${editedNodes > 1 ? "s" : ""} edited`)
  if (addedEdges)
    parts.push(`${addedEdges} edge${addedEdges > 1 ? "s" : ""} added`)
  if (removedEdges)
    parts.push(`${removedEdges} edge${removedEdges > 1 ? "s" : ""} removed`)

  return parts.length > 0 ? parts.join(", ") : "Configuration updated"
}
