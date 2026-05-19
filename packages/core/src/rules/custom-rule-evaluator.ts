import type {
  CustomRuleDefinition,
  CustomRuleNode,
  CustomRuleEdge,
} from "@tripwire/db"
import type { SignalOperator } from "./signal-registry"

export interface ConditionEvaluation {
  nodeId: string
  passed: boolean
  nearMiss: boolean
  detail: string
}

export interface CustomRuleEvalResult {
  passed: boolean
  nearMiss: boolean
  evaluations: ConditionEvaluation[]
}

const NEAR_MISS_RATIO = 0.2

function isNearMissMin(actual: number, threshold: number): boolean {
  if (actual < threshold) return false
  return actual < threshold * (1 + NEAR_MISS_RATIO)
}

function isNearMissMax(actual: number, limit: number): boolean {
  if (actual >= limit) return false
  return actual >= limit * (1 - NEAR_MISS_RATIO)
}

function evaluateNumberCondition(
  actual: number,
  operator: string,
  threshold: number
): boolean {
  switch (operator) {
    case ">":
      return actual > threshold
    case ">=":
      return actual >= threshold
    case "<":
      return actual < threshold
    case "<=":
      return actual <= threshold
    case "==":
      return actual === threshold
    case "!=":
      return actual !== threshold
    default:
      return false
  }
}

function evaluateBooleanCondition(
  actual: boolean,
  operator: string,
  expected: boolean
): boolean {
  switch (operator) {
    case "is":
      return actual === expected
    case "is not":
      return actual !== expected
    default:
      return false
  }
}

function evaluateStringCondition(
  actual: string,
  operator: string,
  expected: string
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected
    case "not_equals":
      return actual !== expected
    case "contains":
      return actual.includes(expected)
    case "matches": {
      try {
        return new RegExp(expected).test(actual)
      } catch {
        return false
      }
    }
    default:
      return false
  }
}

function detectNearMiss(
  operator: string,
  actualNum: number,
  thresholdNum: number,
  passed: boolean
): boolean {
  if (!passed) return false

  switch (operator) {
    case ">":
    case ">=":
      return isNearMissMin(actualNum, thresholdNum)
    case "<":
    case "<=":
      return isNearMissMax(actualNum, thresholdNum)
    default:
      return false
  }
}

function evaluateConditionNode(
  node: CustomRuleNode,
  signals: Record<string, unknown>
): { passed: boolean; nearMiss: boolean; detail: string } {
  const signalId = node.data.signal as string | undefined
  const operator = node.data.operator as SignalOperator | undefined
  const value = node.data.value

  if (!signalId || !operator) {
    return {
      passed: true,
      nearMiss: false,
      detail: "Incomplete condition (no signal or operator)",
    }
  }

  const actual = signals[signalId]
  if (actual === undefined || actual === null) {
    return {
      passed: true,
      nearMiss: false,
      detail: `Signal "${signalId}" not available`,
    }
  }

  if (typeof actual === "number") {
    const threshold = Number(value)
    if (Number.isNaN(threshold)) {
      return {
        passed: true,
        nearMiss: false,
        detail: `Invalid threshold value: ${value}`,
      }
    }
    const passed = evaluateNumberCondition(actual, operator, threshold)
    const nearMiss = detectNearMiss(operator, actual, threshold, passed)
    return {
      passed,
      nearMiss,
      detail: `${signalId} ${operator} ${threshold} (actual: ${actual})`,
    }
  }

  if (typeof actual === "boolean") {
    const expected = value === true || value === "true"
    const passed = evaluateBooleanCondition(actual, operator, expected)
    return {
      passed,
      nearMiss: false,
      detail: `${signalId} ${operator} ${expected} (actual: ${actual})`,
    }
  }

  if (typeof actual === "string") {
    const expected = String(value ?? "")
    const passed = evaluateStringCondition(actual, operator, expected)
    return {
      passed,
      nearMiss: false,
      detail: `${signalId} ${operator} "${expected}" (actual: "${actual}")`,
    }
  }

  return {
    passed: true,
    nearMiss: false,
    detail: `Unsupported signal type for "${signalId}"`,
  }
}

function evaluateLogicGate(gate: string, inputs: boolean[]): boolean {
  switch (gate) {
    case "AND":
      return inputs.length > 0 && inputs.every(Boolean)
    case "OR":
      return inputs.some(Boolean)
    case "NOT":
      return inputs.length > 0 && !inputs[0]
    default:
      return false
  }
}

export function evaluateCustomRule(
  definition: CustomRuleDefinition,
  signals: Record<string, unknown>
): CustomRuleEvalResult {
  const evaluations: ConditionEvaluation[] = []
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]))

  const incomingEdges = new Map<string, CustomRuleEdge[]>()
  const outgoingEdges = new Map<string, CustomRuleEdge[]>()
  for (const e of definition.edges) {
    if (!incomingEdges.has(e.target)) incomingEdges.set(e.target, [])
    incomingEdges.get(e.target)!.push(e)
    if (!outgoingEdges.has(e.source)) outgoingEdges.set(e.source, [])
    outgoingEdges.get(e.source)!.push(e)
  }

  const targetSet = new Set(definition.edges.map((e) => e.target))
  const rootNodeIds = definition.nodes
    .filter((n) => !targetSet.has(n.id))
    .map((n) => n.id)

  const nodeOutcome = new Map<string, boolean>()
  const visited = new Set<string>()
  const queue = [...rootNodeIds]

  while (queue.length > 0) {
    const currentId = queue.shift()!
    if (visited.has(currentId)) continue

    const node = nodeMap.get(currentId)
    if (!node) continue

    if (node.type === "logic") {
      const incoming = incomingEdges.get(currentId) ?? []
      const allInputsReady = incoming.every((e) => nodeOutcome.has(e.source))
      if (!allInputsReady) {
        queue.push(currentId)
        continue
      }
    }

    visited.add(currentId)

    if (node.type === "condition") {
      const result = evaluateConditionNode(node, signals)
      nodeOutcome.set(currentId, result.passed)
      evaluations.push({
        nodeId: currentId,
        passed: result.passed,
        nearMiss: result.nearMiss,
        detail: result.detail,
      })
    } else if (node.type === "logic") {
      const incoming = incomingEdges.get(currentId) ?? []
      const inputResults: boolean[] = []
      for (const edge of incoming) {
        const sourceOutcome = nodeOutcome.get(edge.source)
        if (sourceOutcome !== undefined) {
          const sourceNode = nodeMap.get(edge.source)
          if (
            sourceNode &&
            (sourceNode.type === "condition" || sourceNode.type === "logic")
          ) {
            const handle = edge.sourceHandle
            if (handle === "pass" || handle === "true") {
              inputResults.push(sourceOutcome)
            } else if (handle === "fail" || handle === "false") {
              inputResults.push(!sourceOutcome)
            } else {
              inputResults.push(sourceOutcome)
            }
          } else {
            inputResults.push(sourceOutcome)
          }
        }
      }
      const gate = (node.data.gate as string) ?? "AND"
      const passed = evaluateLogicGate(gate, inputResults)
      nodeOutcome.set(currentId, passed)
      evaluations.push({
        nodeId: currentId,
        passed,
        nearMiss: false,
        detail: `${gate}(${inputResults.map((r) => (r ? "T" : "F")).join(", ")}) = ${passed ? "TRUE" : "FALSE"}`,
      })
    } else if (node.type === "transform") {
      nodeOutcome.set(currentId, true)
      evaluations.push({
        nodeId: currentId,
        passed: true,
        nearMiss: false,
        detail: "Transform node (pass-through)",
      })
    }

    const outEdges = outgoingEdges.get(currentId) ?? []
    for (const edge of outEdges) {
      if (!visited.has(edge.target)) {
        queue.push(edge.target)
      }
    }
  }

  const outputResult = nodeOutcome.get(definition.outputNodeId)
  const passed = outputResult ?? true
  const hasNearMiss = evaluations.some((e) => e.nearMiss)

  return { passed, nearMiss: hasNearMiss && passed, evaluations }
}
