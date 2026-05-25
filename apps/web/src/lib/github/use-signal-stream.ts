import { type QueryKey, useQueryClient } from "@tanstack/react-query"
import { useEffect, useMemo, useRef } from "react"
import { useGitHubSignalPoll } from "./use-signal-poll"

export type GitHubSignalStreamTarget = {
  queryKey: QueryKey
  signalKeys: readonly string[]
}

type ServerMessage = {
  type: "signals"
  keys: string[]
}

function isServerMessage(value: unknown): value is ServerMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === "signals" &&
    Array.isArray((value as { keys?: unknown }).keys) &&
    (value as { keys: unknown[] }).keys.every((k) => typeof k === "string")
  )
}

const RECONNECT_BASE_DELAY_MS = 2_000
const RECONNECT_MAX_DELAY_MS = 30_000

function buildStreamUrl(keys: readonly string[]): string {
  const params = new URLSearchParams({ keys: keys.join(",") })
  return `/api/github/signals/stream?${params.toString()}`
}

function invalidateMatching(
  queryClient: ReturnType<typeof useQueryClient>,
  targets: readonly GitHubSignalStreamTarget[],
  receivedKeys: readonly string[],
): number {
  const set = new Set(receivedKeys)
  let count = 0
  for (const target of targets) {
    if (!target.signalKeys.some((key) => set.has(key))) continue
    const state = queryClient.getQueryState(target.queryKey)
    if (
      !state ||
      state.dataUpdatedAt === 0 ||
      state.fetchStatus === "fetching"
    ) {
      continue
    }
    void queryClient.invalidateQueries({
      queryKey: target.queryKey,
      exact: true,
      refetchType: "active",
    })
    count++
  }
  return count
}

/**
 * Subscribe to revalidation signals over SSE + 20s poll fallback.
 *
 * SSE delivers webhook-driven bumps sub-second. The poll catches anything
 * the SSE missed (process restarts, proxy disconnects, the broker swap to
 * Redis being in-flight, etc.). On networks where EventSource is blocked
 * the poll alone keeps the experience usable — just with 20s latency.
 */
export function useGitHubSignalStream(
  targets: readonly GitHubSignalStreamTarget[],
) {
  const queryClient = useQueryClient()

  const allSignalKeys = useMemo(
    () =>
      Array.from(
        new Set(targets.flatMap((target) => [...target.signalKeys])),
      ).sort(),
    [targets],
  )
  const signalKeysKey = allSignalKeys.join(",")

  const targetsRef = useRef(targets)
  targetsRef.current = targets

  useEffect(() => {
    if (signalKeysKey.length === 0) return
    // EventSource doesn't exist on the server (and during SSR pre-hydration);
    // bail out gracefully — the poll fallback still runs.
    if (typeof EventSource === "undefined") return

    const keys = signalKeysKey.split(",")
    const url = buildStreamUrl(keys)

    let eventSource: EventSource | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let reconnectAttempt = 0
    let disposed = false

    function scheduleReconnect() {
      if (disposed) return
      // Exponential backoff capped at 30s. EventSource itself auto-reconnects,
      // but only if the connection was opened successfully — explicit error
      // path (auth failure, bad URL) needs us to handle it.
      const delay = Math.min(
        RECONNECT_BASE_DELAY_MS * 2 ** reconnectAttempt,
        RECONNECT_MAX_DELAY_MS,
      )
      reconnectAttempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    function connect() {
      if (disposed) return
      try {
        eventSource = new EventSource(url, { withCredentials: true })
      } catch {
        scheduleReconnect()
        return
      }

      eventSource.addEventListener("open", () => {
        reconnectAttempt = 0
      })

      eventSource.addEventListener("message", (event) => {
        let parsed: unknown
        try {
          parsed = JSON.parse(event.data)
        } catch {
          return
        }
        if (!isServerMessage(parsed)) return
        invalidateMatching(queryClient, targetsRef.current, parsed.keys)
      })

      eventSource.addEventListener("error", () => {
        // EventSource will retry on its own when the network drops mid-stream;
        // if it transitions to CLOSED (e.g. 401, 4xx) we have to reopen ourselves.
        if (eventSource?.readyState === EventSource.CLOSED) {
          eventSource?.close()
          eventSource = null
          scheduleReconnect()
        }
      })
    }

    connect()

    return () => {
      disposed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (eventSource) eventSource.close()
    }
  }, [signalKeysKey, queryClient])

  // 20s poll runs alongside — independent safety net.
  useGitHubSignalPoll(targets)
}

export const __internal = {
  buildStreamUrl,
  invalidateMatching,
  isServerMessage,
}
