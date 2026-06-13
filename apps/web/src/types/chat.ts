import type {
  UIMessage,
  UIMessagePart,
  ToolUIPart,
  DynamicToolUIPart,
  ReasoningUIPart,
  UIDataTypes,
  UITools,
} from "ai"
import type { Spec } from "@json-render/core"
import type { RuleConfig } from "@tripwire/db"

export type {
  UIMessage,
  ToolUIPart,
  DynamicToolUIPart,
  ReasoningUIPart as ThinkingPart,
}

export type LegacyToolCallPart = {
  type: "tool-call"
  id?: string
  toolCallId?: string
  name?: string
  arguments?: string
  input?: unknown
  state?: string
  approval?: { id: string; approved?: boolean; reason?: string }
}

export type LegacyToolResultPart = {
  type: "tool-result"
  toolCallId?: string
  id?: string
  content?: string
  state?: string
}

export type LegacyThinkingPart = {
  type: "thinking"
  content?: string
  text?: string
}

/**
 * Synthetic UI-only marker inserted when the user switches the chat's
 * repo context. Rendered by the chat thread as a divider. Stripped by
 * `sanitizeMessages` before reaching the model and not persisted.
 */
export type ContextSwitchPart = {
  type: "context-switch"
  repoName: string
}

export type MessagePart =
  | UIMessagePart<UIDataTypes, UITools>
  | LegacyToolCallPart
  | LegacyToolResultPart
  | LegacyThinkingPart
  | ContextSwitchPart

export type ToolCallPart = ToolUIPart | DynamicToolUIPart | LegacyToolCallPart
export type ToolResultPart = LegacyToolResultPart

/** Re-export json-render Spec for tool result rendering */
export type { Spec as RenderSpec }

/** Serialized messages stored in DB and exchanged with API */
export type SerializedMessage = Record<string, unknown>

export interface ActionResultData {
  success: boolean
  message: string
  action: string
  username?: string
}

/** A mutable copy of RuleConfig for dynamic field access in tool handlers */
export type MutableRuleConfig = {
  [K in keyof RuleConfig]: Record<string, unknown>
}

/** Error shape from upstream providers (OpenRouter, OpenAI, etc.) */
export interface ProviderError {
  error?: {
    metadata?: { raw?: unknown; provider_name?: string }
    message?: string
  }
  message?: string
}
