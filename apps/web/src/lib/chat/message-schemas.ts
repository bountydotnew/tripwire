import { z } from "zod"

/**
 * Zod schemas + predicate wrappers for the loosely-typed AI-SDK message parts
 * we read out of persisted chat history (untrusted JSON). The schema is the
 * source of truth for "what shape is this part"; the thin `is*` wrappers keep
 * the narrowing ergonomics the call sites rely on. Replaces the hand-rolled
 * `isRecord` / `isLegacyToolCall` / `isLegacyToolResult` / `isAiSdkToolPart`
 * guards that were duplicated inline.
 */

const recordSchema = z.record(z.string(), z.unknown())

/** A non-null object whose keys can be safely indexed. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return recordSchema.safeParse(value).success
}

const textPartSchema = z.object({ type: z.literal("text") })
const legacyToolCallSchema = z.object({ type: z.literal("tool-call") })
const legacyToolResultSchema = z.object({ type: z.literal("tool-result") })
const aiSdkToolPartSchema = z
  .object({ type: z.string() })
  .refine(
    (p) =>
      p.type === "dynamic-tool" ||
      (p.type.startsWith("tool-") && p.type !== "tool-call")
  )

export type LegacyToolCallPart = Record<string, unknown> & {
  type: "tool-call"
  name?: string
  toolCallId?: string
  id?: string
  state?: string
  approval?: unknown
  arguments?: string
  input?: Record<string, unknown>
}

export type LegacyToolResultPart = Record<string, unknown> & {
  type: "tool-result"
  toolCallId?: string
  id?: string
  state?: string
  content?: string
  output?: unknown
}

/** Old TanStack-style completed tool call. */
export function isLegacyToolCall(part: unknown): part is LegacyToolCallPart {
  return legacyToolCallSchema.safeParse(part).success
}

/** Old TanStack-style tool result. */
export function isLegacyToolResult(
  part: unknown
): part is LegacyToolResultPart {
  return legacyToolResultSchema.safeParse(part).success
}

/** AI SDK v6 tool part (`tool-<name>` or `dynamic-tool`, but not legacy `tool-call`). */
export function isAiSdkToolPart(part: unknown): boolean {
  return aiSdkToolPartSchema.safeParse(part).success
}

/** A `{ type: "text" }` message part. */
export function isTextPart(part: unknown): boolean {
  return textPartSchema.safeParse(part).success
}
