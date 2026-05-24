const CHANNEL_NAME = "tripwire:workflow-mutations"

type MutationCallback = (workflowId: string) => void

const localTarget = new EventTarget()

let channel: BroadcastChannel | null = null

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME)
  }
  return channel
}

export function broadcastWorkflowMutation(workflowId: string): void {
  const bc = getChannel()
  if (bc) {
    bc.postMessage({ workflowId })
  }
  localTarget.dispatchEvent(
    new CustomEvent("workflow-mutation", { detail: workflowId })
  )
}

const WORKFLOW_MUTATION_TOOLS = new Set([
  "create_workflow",
  "edit_workflow",
  "delete_workflow",
  "enable_workflow",
])

export function extractWorkflowIdsFromMessages(
  messages: Array<{ role: string; parts?: Array<Record<string, unknown>> }>
): string[] {
  const ids = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.parts) continue
    for (const part of msg.parts) {
      if (part.type !== "tool-invocation") continue
      const toolName = part.toolName as string | undefined
      if (!toolName || !WORKFLOW_MUTATION_TOOLS.has(toolName)) continue
      const args = part.args as Record<string, unknown> | undefined
      const result = part.result as Record<string, unknown> | undefined
      const wfId =
        (args?.workflowId as string | undefined) ??
        (result?.workflowId as string | undefined)
      if (typeof wfId === "string") ids.add(wfId)
    }
  }
  return Array.from(ids)
}

export function onWorkflowMutation(callback: MutationCallback): () => void {
  const handleLocal = (e: Event) => {
    callback((e as CustomEvent<string>).detail)
  }
  localTarget.addEventListener("workflow-mutation", handleLocal)

  const bc = getChannel()
  const handleBroadcast = (e: MessageEvent) => {
    const workflowId = e.data?.workflowId
    if (typeof workflowId === "string") {
      callback(workflowId)
    }
  }
  bc?.addEventListener("message", handleBroadcast)

  return () => {
    localTarget.removeEventListener("workflow-mutation", handleLocal)
    bc?.removeEventListener("message", handleBroadcast)
  }
}

const RULE_MUTATION_TOOLS = new Set([
  "create_custom_rule",
  "edit_custom_rule",
  "delete_custom_rule",
  "toggle_custom_rule",
  "update_custom_rule_action",
])

export function broadcastRuleMutation(ruleId: string): void {
  const bc = getChannel()
  if (bc) {
    bc.postMessage({ ruleId })
  }
  localTarget.dispatchEvent(
    new CustomEvent("rule-mutation", { detail: ruleId })
  )
}

export function extractRuleIdsFromMessages(
  messages: Array<{ role: string; parts?: Array<Record<string, unknown>> }>
): string[] {
  const ids = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== "assistant" || !msg.parts) continue
    for (const part of msg.parts) {
      if (part.type !== "tool-invocation") continue
      const toolName = part.toolName as string | undefined
      if (!toolName || !RULE_MUTATION_TOOLS.has(toolName)) continue
      const args = part.args as Record<string, unknown> | undefined
      const result = part.result as Record<string, unknown> | undefined
      const resultData = result?.data as Record<string, unknown> | undefined
      const ruleId =
        (args?.ruleId as string | undefined) ??
        (resultData?.id as string | undefined)
      if (typeof ruleId === "string") ids.add(ruleId)
    }
  }
  return Array.from(ids)
}

export function onRuleMutation(callback: MutationCallback): () => void {
  const handleLocal = (e: Event) => {
    callback((e as CustomEvent<string>).detail)
  }
  localTarget.addEventListener("rule-mutation", handleLocal)

  const bc = getChannel()
  const handleBroadcast = (e: MessageEvent) => {
    const ruleId = e.data?.ruleId
    if (typeof ruleId === "string") {
      callback(ruleId)
    }
  }
  bc?.addEventListener("message", handleBroadcast)

  return () => {
    localTarget.removeEventListener("rule-mutation", handleLocal)
    bc?.removeEventListener("message", handleBroadcast)
  }
}
