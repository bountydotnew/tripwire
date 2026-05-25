import { createFileRoute } from "@tanstack/react-router"
import { auth } from "@tripwire/auth"
import { subscribeToSignals } from "@tripwire/github/signal-broker"

const KEEPALIVE_INTERVAL_MS = 30_000
const MAX_SUBSCRIBED_KEYS = 64

/**
 * Server-Sent Events endpoint for sub-second signal delivery. The browser
 * opens an EventSource with `?keys=user:torvalds,repo:owner/name,...` and
 * receives `data: {"keys":[...]}` events whenever any of those keys is
 * broadcast (i.e. a webhook for that user/repo arrived). Sits in front
 * of the 20s poll layer — the poll is the safety net for missed pushes
 * across process restarts or proxy hiccups.
 *
 * Auth: requires a valid session. Cookies are sent automatically by
 * EventSource since same-origin.
 */
async function handler({ request }: { request: Request }) {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) {
    return new Response("Unauthorized", { status: 401 })
  }

  const url = new URL(request.url)
  const rawKeys = url.searchParams.get("keys") ?? ""
  const keys = rawKeys
    .split(",")
    .map((key) => key.trim())
    .filter(Boolean)
    .slice(0, MAX_SUBSCRIBED_KEYS)

  if (keys.length === 0) {
    return new Response("Missing keys parameter", { status: 400 })
  }

  const encoder = new TextEncoder()
  let unsubscribe: (() => void) | null = null
  let keepalive: ReturnType<typeof setInterval> | null = null

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      // Initial comment kicks the stream open so the browser knows the
      // connection is live before any real event fires.
      controller.enqueue(encoder.encode(": connected\n\n"))

      unsubscribe = subscribeToSignals(keys, (matchedKeys) => {
        const line = `data: ${JSON.stringify({ type: "signals", keys: matchedKeys })}\n\n`
        try {
          controller.enqueue(encoder.encode(line))
        } catch {
          // Stream was closed (client disconnected). Teardown below.
        }
      })

      // Keep-alive ping (SSE comment) every 30s so intermediary proxies
      // don't decide the connection is idle and close it.
      keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          // Stream closed — ignore.
        }
      }, KEEPALIVE_INTERVAL_MS)

      // If the client navigates away or aborts, clean up immediately.
      request.signal.addEventListener("abort", () => {
        try {
          controller.close()
        } catch {
          // Already closed.
        }
      })
    },
    cancel() {
      if (unsubscribe) unsubscribe()
      if (keepalive) clearInterval(keepalive)
    },
  })

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      // Disable buffering on proxies that honor it (nginx, Cloudflare).
      "x-accel-buffering": "no",
    },
  })
}

export const Route = createFileRoute("/api/github/signals/stream")({
  server: {
    handlers: { GET: handler },
  },
})
