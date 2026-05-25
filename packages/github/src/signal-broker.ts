/**
 * In-process signal broker. After the webhook handler marks revalidation
 * signals in D1, it calls `broadcastSignalKeys` to fan out to any SSE/WS
 * consumers connected to this process. Consumers subscribe via
 * `subscribeToSignals`.
 *
 * Single-instance only. For multi-instance deploys swap the EventEmitter
 * for a Redis pub/sub (or Postgres NOTIFY) — the public API is unchanged,
 * the poll layer covers the gap during the swap.
 */

import { EventEmitter } from "node:events"

const BROADCAST_EVENT = "github-signal"

/**
 * Module-scope emitter. EventEmitter's default max listeners is 10 —
 * raise it generously since each open SSE connection adds one listener.
 */
const emitter = new EventEmitter()
emitter.setMaxListeners(0)

/**
 * Fan out a set of bumped signal keys to every connected subscriber.
 * Best-effort: failures here are swallowed so a webhook isn't blocked
 * by a slow subscriber.
 */
export function broadcastSignalKeys(keys: string[]): void {
  if (keys.length === 0) return
  try {
    emitter.emit(BROADCAST_EVENT, keys)
  } catch {
    // Listener exceptions don't propagate — keep the webhook path clean.
  }
}

/**
 * Subscribe a callback to signal broadcasts. The callback runs once
 * per broadcast that includes at least one of `signalKeys`, filtered
 * to just the matching keys. Returns a teardown fn.
 *
 * Cheap O(connected-clients × keys-per-broadcast). Each browser tab
 * subscribes to a tiny set (the keys for queries it has open).
 */
export function subscribeToSignals(
  signalKeys: readonly string[],
  onMatch: (matchedKeys: string[]) => void,
): () => void {
  if (signalKeys.length === 0) {
    return () => undefined
  }
  const watch = new Set(signalKeys)
  const listener = (keys: string[]) => {
    const matched = keys.filter((key) => watch.has(key))
    if (matched.length > 0) onMatch(matched)
  }
  emitter.on(BROADCAST_EVENT, listener)
  return () => {
    emitter.off(BROADCAST_EVENT, listener)
  }
}

/** Exported for unit tests. */
export const __internal = {
  emitter,
  BROADCAST_EVENT,
}
