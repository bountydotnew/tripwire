import type {
  WorkflowDefinition,
  WorkflowNode,
  WorkflowEdge,
} from "@tripwire/db"
import { getNodeEntry } from "./workflow-registry"
import type { WorkflowOperation } from "./workflow-operations-schema"

export type { WorkflowOperation }

function generateId(): string {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    "4" + hex.slice(13, 16),
    ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16) + hex.slice(17, 20),
    hex.slice(20, 32),
  ].join("-")
}

function computeAutoPosition(nodes: WorkflowNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 250, y: 50 }
  }
  const maxY = Math.max(...nodes.map((n) => n.position.y))
  return { x: 250, y: maxY + 170 }
}

function buildDefaultData(
  type: string,
  subtype: string
): Record<string, unknown> {
  switch (type) {
    case "trigger":
      if (subtype === "schedule") {
        return {
          trigger: "schedule",
          scheduleType: "daily",
          dailyTime: "09:00",
          timezone: "UTC",
        }
      }
      return { trigger: subtype }
    case "rule":
      return { rule: subtype, params: {} }
    case "condition":
      return { field: "score", operator: ">", value: "50" }
    case "logic":
      return { gate: subtype }
    case "action":
      return { action: subtype }
    case "delay":
      return { durationValue: 5, durationUnit: "m" }
    case "transform":
      return { transform: subtype }
    default:
      return {}
  }
}

export function applyWorkflowOperations(
  state: WorkflowDefinition,
  operations: WorkflowOperation[]
): { state: WorkflowDefinition; errors: string[]; warnings: string[] } {
  const result: WorkflowDefinition = structuredClone(state)
  const errors: string[] = []
  const warnings: string[] = []

  const deleteNodeOps: Extract<WorkflowOperation, { op: "delete_node" }>[] = []
  const deleteEdgeOps: Extract<WorkflowOperation, { op: "delete_edge" }>[] = []
  const addNodeOps: Extract<WorkflowOperation, { op: "add_node" }>[] = []
  const editNodeOps: Extract<WorkflowOperation, { op: "edit_node" }>[] = []
  const addEdgeOps: Extract<WorkflowOperation, { op: "add_edge" }>[] = []

  for (const op of operations) {
    switch (op.op) {
      case "delete_node":
        deleteNodeOps.push(op)
        break
      case "delete_edge":
        deleteEdgeOps.push(op)
        break
      case "add_node":
        addNodeOps.push(op)
        break
      case "edit_node":
        editNodeOps.push(op)
        break
      case "add_edge":
        addEdgeOps.push(op)
        break
    }
  }

  const sorted = [
    ...deleteNodeOps,
    ...deleteEdgeOps,
    ...addNodeOps,
    ...editNodeOps,
    ...addEdgeOps,
  ]

  for (const op of sorted) {
    switch (op.op) {
      case "delete_node": {
        const idx = result.nodes.findIndex((n) => n.id === op.id)
        if (idx === -1) {
          errors.push(`delete_node: node "${op.id}" not found`)
          break
        }
        result.nodes.splice(idx, 1)
        result.edges = result.edges.filter(
          (e) => e.source !== op.id && e.target !== op.id
        )
        break
      }

      case "delete_edge": {
        const idx = result.edges.findIndex((e) => e.id === op.id)
        if (idx === -1) {
          errors.push(`delete_edge: edge "${op.id}" not found`)
          break
        }
        result.edges.splice(idx, 1)
        break
      }

      case "add_node": {
        const entry = getNodeEntry(op.type, op.subtype)
        if (!entry) {
          errors.push(`add_node: unknown type "${op.type}/${op.subtype}"`)
          break
        }
        if (entry.hidden) {
          warnings.push(`add_node: "${op.subtype}" is marked as coming soon`)
        }
        const nodeId = op.id ?? generateId()
        const position = op.position ?? computeAutoPosition(result.nodes)
        const defaultData = buildDefaultData(op.type, op.subtype)
        const data = op.data ? { ...defaultData, ...op.data } : defaultData
        const node: WorkflowNode = {
          id: nodeId,
          type: op.type,
          position,
          data,
        }
        result.nodes.push(node)
        break
      }

      case "edit_node": {
        const node = result.nodes.find((n) => n.id === op.id)
        if (!node) {
          errors.push(`edit_node: node "${op.id}" not found`)
          break
        }
        if (op.data) {
          node.data = { ...node.data, ...op.data }
        }
        if (op.position) {
          node.position = op.position
        }
        break
      }

      case "add_edge": {
        const sourceExists = result.nodes.some((n) => n.id === op.source)
        const targetExists = result.nodes.some((n) => n.id === op.target)
        if (!sourceExists) {
          errors.push(`add_edge: source node "${op.source}" not found`)
          break
        }
        if (!targetExists) {
          errors.push(`add_edge: target node "${op.target}" not found`)
          break
        }
        const edgeId = op.id ?? generateId()
        const edge: WorkflowEdge = {
          id: edgeId,
          source: op.source,
          target: op.target,
          sourceHandle: op.sourceHandle ?? null,
          targetHandle: op.targetHandle ?? null,
        }
        result.edges.push(edge)
        break
      }
    }
  }

  return { state: result, errors, warnings }
}
