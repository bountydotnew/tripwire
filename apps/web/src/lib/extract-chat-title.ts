import type { UIMessage } from "ai"

function isTextLikePart(part: unknown): boolean {
  return (
    typeof part === "object" &&
    part !== null &&
    "type" in part &&
    (part as { type: unknown }).type === "text"
  )
}

function textFromPart(part: unknown): string {
  if (typeof part !== "object" || part === null) return ""
  const o = part as { text?: unknown; content?: unknown }
  if (typeof o.text === "string") return o.text
  if (typeof o.content === "string") return o.content
  return ""
}

/** Short title from first user message (persisted chat sidebar / metadata). */
export function extractChatTitle(messages: UIMessage[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser?.parts) return "New chat"
  const text = firstUser.parts.filter(isTextLikePart).map(textFromPart).join("")
  return text.slice(0, 80) || "New chat"
}
