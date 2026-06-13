import { useCallback, useEffect, useRef } from "react"
import { createLogger } from "@tripwire/logger"

const logger = createLogger("useRefreshOnReturn")

/**
 * Watches for the user returning to the tab after navigating away (e.g.
 * to GitHub's app install / settings pages) and runs the caller's
 * refresh function once per transition.
 *
 * Why this exists: when the user changes app permissions on GitHub and
 * comes back, no webhook fires for the act of "you finished configuring,"
 * so we have no other signal. The browser DOES tell us they returned —
 * use that as the trigger.
 *
 * Fires only on hidden→visible transitions (not on initial mount), so an
 * always-visible page doesn't kick off a refresh as soon as it mounts.
 */

export type RefreshOnReturnOptions = {
  /** Caller's async refresh fn. Errors are swallowed (logged via console). */
  refresh: () => Promise<unknown> | unknown
  /** Defaults to true. When false, the listener doesn't attach. */
  enabled?: boolean
}

/**
 * Pure state machine driving the visibility transition. Exposed for
 * unit tests so we can assert the transition logic without a JSDOM
 * setup or fake timers.
 */
export type VisibilityState = {
  wasHidden: boolean
}

export function nextVisibilityState(
  state: VisibilityState,
  event: { hidden: boolean }
): { next: VisibilityState; shouldRefresh: boolean } {
  if (event.hidden) {
    // Going away — record that we've been hidden so the next visible
    // transition will count as a "return."
    return { next: { wasHidden: true }, shouldRefresh: false }
  }
  if (state.wasHidden) {
    // Coming back from a prior hidden state — refresh once, then reset.
    return { next: { wasHidden: false }, shouldRefresh: true }
  }
  // Was already visible (e.g. initial mount) — no-op.
  return { next: state, shouldRefresh: false }
}

export function useRefreshOnReturn({
  refresh,
  enabled = true,
}: RefreshOnReturnOptions): () => Promise<void> {
  const refreshRef = useRef(refresh)
  refreshRef.current = refresh

  const runRefresh = useCallback(async () => {
    try {
      await refreshRef.current()
    } catch (err) {
      logger.error("refresh failed", err)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    if (typeof document === "undefined") return

    let state: VisibilityState = { wasHidden: false }

    function handleVisibilityChange() {
      const result = nextVisibilityState(state, { hidden: document.hidden })
      state = result.next
      if (result.shouldRefresh) {
        void runRefresh()
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [enabled, runRefresh])

  return runRefresh
}
