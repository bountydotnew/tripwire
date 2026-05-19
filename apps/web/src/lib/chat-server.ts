import type { UIMessage } from "ai"
import type { ToolSet } from "ai"

export type ChatHistoryMessage = UIMessage | Record<string, unknown>

type LooseMsg = Record<string, unknown>

function asLoose(msg: ChatHistoryMessage): LooseMsg {
  return msg as unknown as LooseMsg
}

export function mergeClientMessagesWithStored(
  clientMessages: ChatHistoryMessage[],
  storedMessages: ChatHistoryMessage[]
): ChatHistoryMessage[] {
  if (storedMessages.length === 0) {
    return clientMessages
      .filter((message) => asLoose(message).role === "user")
      .map((message) => cloneMessage(message))
  }

  const merged = storedMessages.map((message) => cloneMessage(message))
  const mergedById = new Map<string, ChatHistoryMessage>()
  for (const message of merged) {
    const id = asLoose(message).id
    if (typeof id === "string") mergedById.set(id, message)
  }

  for (const clientMessage of clientMessages) {
    const cid = asLoose(clientMessage).id
    const existing = typeof cid === "string" ? mergedById.get(cid) : undefined

    if (!existing) {
      if (asLoose(clientMessage).role === "user") {
        merged.push(cloneMessage(clientMessage))
      }
      continue
    }

    if (asLoose(existing).role === "assistant") {
      applyApprovalResponses(existing, clientMessage)
    }
  }

  return merged
}

function applyApprovalResponses(
  storedMessage: ChatHistoryMessage,
  clientMessage: ChatHistoryMessage
): void {
  const stored = asLoose(storedMessage)
  const client = asLoose(clientMessage)
  const storedParts = stored.parts
  const clientParts = client.parts
  if (!Array.isArray(storedParts) || !Array.isArray(clientParts)) return

  const storedApprovals = new Map<string, LooseMsg>()
  for (const part of storedParts) {
    if (!isRecord(part)) continue
    const id = getPartToolCallId(part)
    if (!id || part.state !== "approval-requested" || !isRecord(part.approval))
      continue
    const appr = part.approval as LooseMsg
    if (typeof appr.id !== "string") continue
    storedApprovals.set(id, part as LooseMsg)
  }

  for (const clientPart of clientParts) {
    if (!isRecord(clientPart)) continue
    const id = getPartToolCallId(clientPart)
    if (!id || clientPart.state !== "approval-responded") continue
    const storedPart = storedApprovals.get(id)
    if (!storedPart) continue
    const clientApproval = clientPart.approval
    const storedApproval = storedPart.approval
    if (
      !isRecord(clientApproval) ||
      !isRecord(storedApproval) ||
      clientApproval.id !== storedApproval.id
    )
      continue
    storedPart.state = "approval-responded"
    storedPart.approval = {
      ...storedApproval,
      approved: Boolean(clientApproval.approved),
      ...(typeof clientApproval.reason === "string"
        ? { reason: clientApproval.reason }
        : {}),
    }
  }
}

/**
 * Clean up UI messages before sending to the model.
 *
 * Keeps completed AI SDK v6 tool parts, converts old TanStack-style completed
 * tool-call/result pairs, and drops pending or orphaned tool state unless the
 * user just responded to a stored approval.
 */
export function sanitizeMessages(
  rawMessages: ChatHistoryMessage[],
  tools?: ToolSet
): UIMessage[] {
  const merged: ChatHistoryMessage[] = [...rawMessages]

  // Merge split assistant messages: tool-result-only messages get folded
  // into the preceding assistant message that owns the matching tool-call.
  for (let i = merged.length - 1; i >= 0; i--) {
    const msg = asLoose(merged[i])
    if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue

    const parts = msg.parts as unknown[]
    const hasOnlyResults =
      parts.length > 0 &&
      parts.every((p) => isRecord(p) && p.type === "tool-result")
    if (!hasOnlyResults) continue

    for (let j = i - 1; j >= 0; j--) {
      const prev = asLoose(merged[j])
      if (prev.role !== "assistant" || !Array.isArray(prev.parts)) continue
      const prevParts = prev.parts as unknown[]
      const hasMatchingCall = prevParts.some(
        (p) =>
          isRecord(p) &&
          p.type === "tool-call" &&
          parts.some((r) => {
            if (!isRecord(r)) return false
            const rid = r.toolCallId || r.id
            const pid = p.toolCallId || p.id
            return rid === pid
          })
      )
      if (hasMatchingCall) {
        merged[j] = {
          ...prev,
          parts: [...prevParts, ...parts],
        } as ChatHistoryMessage
        merged.splice(i, 1)
        break
      }
    }
  }

  // Build a set of tool-call IDs that have a matching result IN THE SAME
  // message. Anything else (pending approvals, orphaned results, cross-turn
  // pairs) gets stripped below.
  const completedCallIds = new Set<string>()
  for (const entry of merged) {
    const msg = asLoose(entry)
    if (!Array.isArray(msg.parts)) continue
    const msgParts = msg.parts as unknown[]
    const msgResultIds = new Set<string>()
    for (const part of msgParts) {
      if (isLegacyToolResult(part)) {
        const id = part.toolCallId || part.id
        if (typeof id === "string") msgResultIds.add(id)
      }
    }
    for (const part of msgParts) {
      if (isLegacyToolCall(part) && typeof part.name === "string") {
        const id = part.toolCallId || part.id
        if (typeof id === "string" && msgResultIds.has(id))
          completedCallIds.add(id)
      }
    }
  }

  let result = merged
    .map((entry) => {
      const msg = asLoose(entry)
      if (msg.role === "tool") {
        const tcid = msg.tool_call_id
        if (typeof tcid !== "string" || !completedCallIds.has(tcid)) return null
        return entry
      }
      if (!Array.isArray(msg.parts)) return entry

      const cleanParts = (msg.parts as unknown[])
        .filter((part) => {
          if (isLegacyToolCall(part)) {
            if (typeof part.name !== "string") return false
            const id = part.toolCallId || part.id
            return typeof id === "string" && completedCallIds.has(id)
          }
          if (isLegacyToolResult(part)) {
            const id = part.toolCallId || part.id
            return typeof id === "string" && completedCallIds.has(id)
          }
          return true
        })
        .map((part) => {
          if (!isRecord(part)) return part
          const id = part.toolCallId ?? part.id
          const idStr = typeof id === "string" ? id : undefined
          if (isLegacyToolCall(part) && idStr && completedCallIds.has(idStr)) {
            if (
              part.state !== "input-complete" &&
              part.state !== "approval-responded"
            ) {
              return { ...part, state: "input-complete" }
            }
          }
          if (
            isLegacyToolResult(part) &&
            idStr &&
            completedCallIds.has(idStr)
          ) {
            if (part.state !== "complete" && part.state !== "error") {
              return { ...part, state: "complete" }
            }
          }
          return part
        })

      return { ...msg, parts: cleanParts } as ChatHistoryMessage
    })
    .filter((entry): entry is ChatHistoryMessage => {
      if (entry === null) return false
      const msg = asLoose(entry)
      if (Array.isArray(msg.parts) && msg.parts.length === 0) return false
      return true
    })

  // Safety net: drop legacy tool calls from assistant messages without
  // matching results. AI SDK approval parts are preserved above.
  for (const entry of result) {
    const msg = asLoose(entry)
    if (msg.role !== "assistant" || !Array.isArray(msg.parts)) continue
    const msgParts = msg.parts as unknown[]
    const resultIds = new Set<string>()
    for (const part of msgParts) {
      if (isLegacyToolResult(part)) {
        const id = part.toolCallId || part.id
        if (typeof id === "string") resultIds.add(id)
      }
    }
    msg.parts = msgParts.filter((part) => {
      if (!isLegacyToolCall(part)) return true
      const id = part.toolCallId || part.id
      return typeof id === "string" && resultIds.has(id)
    })
  }

  stripIncompleteAssistantToolsBeforeUserTurn(result)

  return result
    .filter((entry) => {
      const msg = asLoose(entry)
      if (Array.isArray(msg.parts) && msg.parts.length === 0) return false
      return true
    })
    .map((entry) => normalizeMessageForAiSdk(entry, tools))
    .filter(
      (msg): msg is UIMessage =>
        msg !== null && Array.isArray(msg.parts) && msg.parts.length > 0
    )
}

function normalizeMessageForAiSdk(
  message: ChatHistoryMessage,
  tools?: ToolSet
): UIMessage | null {
  const msg = asLoose(message)
  if (!msg || typeof msg !== "object") return null
  const role = msg.role
  if (
    typeof role !== "string" ||
    !["system", "user", "assistant"].includes(role)
  )
    return null

  const parts = Array.isArray(msg.parts)
    ? normalizeParts(msg.parts as unknown[], tools)
    : typeof msg.content === "string"
      ? [{ type: "text" as const, text: msg.content }]
      : []

  return {
    id: typeof msg.id === "string" ? msg.id : crypto.randomUUID(),
    role: role as UIMessage["role"],
    parts,
  }
}

function normalizeParts(parts: unknown[], tools?: ToolSet): UIMessage["parts"] {
  const legacyResults = new Map<string, LooseMsg>()
  for (const part of parts) {
    if (!isLegacyToolResult(part)) continue
    const id = part.toolCallId || part.id
    if (typeof id === "string") legacyResults.set(id, part as LooseMsg)
  }

  const normalized: UIMessage["parts"] = []
  for (const part of parts) {
    if (isRecord(part) && part.type === "text") {
      const text = part.text ?? part.content
      if (typeof text === "string" && text.length > 0) {
        normalized.push({ type: "text", text })
      }
      continue
    }

    if (
      isRecord(part) &&
      (part.type === "thinking" || part.type === "reasoning")
    ) {
      const text = part.text ?? part.content
      if (typeof text === "string" && text.length > 0) {
        normalized.push({
          type: "reasoning",
          text,
          state: "done",
        })
      }
      continue
    }

    if (isAiSdkToolPart(part)) {
      const toolName = getPartToolName(part as LooseMsg)
      if (toolName && (!tools || tools[toolName])) {
        normalized.push(part as UIMessage["parts"][number])
      }
      continue
    }

    if (isLegacyToolCall(part) && typeof part.name === "string") {
      const id = getPartToolCallId(part)
      const result = id ? legacyResults.get(id) : undefined
      if (!id || !result || (tools && !tools[part.name])) continue
      normalized.push({
        type: `tool-${part.name}`,
        toolCallId: id,
        state: result.state === "error" ? "output-error" : "output-available",
        input: parseToolInput(part),
        ...(result.state === "error"
          ? { errorText: parseToolResultError(result) }
          : { output: parseToolResultOutput(result) }),
        ...(isRecord(part.approval) ? { approval: part.approval } : {}),
      } as UIMessage["parts"][number])
    }
  }

  return normalized
}

function stripIncompleteAssistantToolsBeforeUserTurn(
  messages: ChatHistoryMessage[]
): void {
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = asLoose(messages[i])
    const next = asLoose(messages[i + 1])
    if (
      cur.role !== "assistant" ||
      next.role !== "user" ||
      !Array.isArray(cur.parts)
    )
      continue

    cur.parts = (cur.parts as unknown[]).filter((part) => {
      if (!isAiSdkToolPart(part)) return true
      if (!isRecord(part)) return true
      const s = part.state
      return (
        s === "output-available" ||
        s === "output-error" ||
        s === "output-denied" ||
        s === "approval-requested" ||
        s === "approval-responded"
      )
    })
  }
}

function cloneMessage(message: ChatHistoryMessage): ChatHistoryMessage {
  return JSON.parse(JSON.stringify(message)) as ChatHistoryMessage
}

function isRecord(value: unknown): value is LooseMsg {
  return typeof value === "object" && value !== null
}

function isLegacyToolCall(part: unknown): part is LooseMsg & {
  type: "tool-call"
  name?: string
  toolCallId?: string
  id?: string
  state?: string
  approval?: unknown
  arguments?: string
  input?: Record<string, unknown>
} {
  return isRecord(part) && part.type === "tool-call"
}

function isLegacyToolResult(part: unknown): part is LooseMsg & {
  type: "tool-result"
  toolCallId?: string
  id?: string
  state?: string
  content?: string
  output?: unknown
} {
  return isRecord(part) && part.type === "tool-result"
}

function isAiSdkToolPart(part: unknown): boolean {
  if (!isRecord(part)) return false
  const t = part.type
  return (
    t === "dynamic-tool" ||
    (typeof t === "string" && t.startsWith("tool-") && t !== "tool-call")
  )
}

function getPartToolName(part: LooseMsg): string | undefined {
  if (part.type === "dynamic-tool" && typeof part.toolName === "string")
    return part.toolName
  const t = part.type
  if (typeof t === "string" && t.startsWith("tool-"))
    return t.slice("tool-".length)
  const n = part.name
  return typeof n === "string" ? n : undefined
}

function getPartToolCallId(part: LooseMsg): string | undefined {
  if (typeof part.toolCallId === "string") return part.toolCallId
  if (typeof part.id === "string") return part.id
  return undefined
}

function parseToolInput(part: LooseMsg): Record<string, unknown> {
  const input = part.input
  if (input && typeof input === "object")
    return input as Record<string, unknown>
  const args = part.arguments
  if (typeof args !== "string") return {}
  try {
    return JSON.parse(args) as Record<string, unknown>
  } catch {
    return {}
  }
}

function parseToolResultOutput(part: LooseMsg): unknown {
  if (part.output !== undefined) return part.output
  if (typeof part.content !== "string") return part.content ?? null
  try {
    return JSON.parse(part.content)
  } catch {
    return part.content
  }
}

function parseToolResultError(part: LooseMsg): string {
  const output = parseToolResultOutput(part)
  if (output && typeof output === "object" && "error" in output) {
    return String((output as { error: unknown }).error)
  }
  return typeof output === "string" ? output : "Tool execution failed"
}
