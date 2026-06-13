import type { UIMessage } from "#/types/chat"

/**
 * Build the synthetic chat message used as a context-switch divider.
 *
 * The marker carries a single `context-switch` part. `sanitizeMessages`
 * strips unknown part types before the model is invoked, so the marker
 * never reaches the LLM and is not persisted by the streaming
 * onFinish writer. It is a pure UI cue scoped to the current session.
 */
export function buildContextSwitchMarker(repoName: string): UIMessage {
  return {
    id: `context-switch-${crypto.randomUUID()}`,
    role: "assistant",
    parts: [{ type: "context-switch", repoName }],
  } as unknown as UIMessage
}
