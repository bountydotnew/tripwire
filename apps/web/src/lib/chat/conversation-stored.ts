import type { ConversationStoredMessage } from "@tripwire/db"
import type { UIMessage } from "ai"

/** Serialize chat payloads into Drizzle `jsonb` (`ConversationStoredMessage[]`). */
export function asConversationStoredMessages(
  messages: unknown
): ConversationStoredMessage[] {
  return messages as ConversationStoredMessage[]
}

/** Hydrate DB rows into UI messages (trust boundary: DB JSON → AI SDK shape). */
export function uiMessagesFromStored(
  stored: ConversationStoredMessage[] | undefined | null
): UIMessage[] {
  if (!stored?.length) return []
  return stored as unknown as UIMessage[]
}
