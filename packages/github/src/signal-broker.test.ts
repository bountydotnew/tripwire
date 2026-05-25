import { afterEach, describe, expect, it, vi } from "vitest"
import {
  __internal,
  broadcastSignalKeys,
  subscribeToSignals,
} from "./signal-broker"

afterEach(() => {
  // Ensure no stale listeners leak between tests.
  __internal.emitter.removeAllListeners(__internal.BROADCAST_EVENT)
})

describe("broadcastSignalKeys / subscribeToSignals", () => {
  it("delivers a broadcast to a subscriber whose key set overlaps", () => {
    const callback = vi.fn()
    subscribeToSignals(["user:torvalds", "repo:torvalds/linux"], callback)

    broadcastSignalKeys(["user:torvalds"])

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenCalledWith(["user:torvalds"])
  })

  it("passes only the matching subset of keys to the subscriber", () => {
    const callback = vi.fn()
    subscribeToSignals(["user:torvalds"], callback)

    broadcastSignalKeys(["user:torvalds", "user:somebody-else"])

    expect(callback).toHaveBeenCalledWith(["user:torvalds"])
  })

  it("does not call the subscriber when no keys overlap", () => {
    const callback = vi.fn()
    subscribeToSignals(["user:torvalds"], callback)

    broadcastSignalKeys(["user:somebody-else"])

    expect(callback).not.toHaveBeenCalled()
  })

  it("returns a teardown that removes the listener", () => {
    const callback = vi.fn()
    const teardown = subscribeToSignals(["user:torvalds"], callback)

    teardown()
    broadcastSignalKeys(["user:torvalds"])

    expect(callback).not.toHaveBeenCalled()
  })

  it("fans out one broadcast to multiple subscribers independently", () => {
    const a = vi.fn()
    const b = vi.fn()
    subscribeToSignals(["user:x"], a)
    subscribeToSignals(["user:x"], b)

    broadcastSignalKeys(["user:x"])

    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it("is a no-op for empty broadcasts and empty subscriptions", () => {
    const callback = vi.fn()
    const teardown = subscribeToSignals([], callback)
    broadcastSignalKeys([])
    broadcastSignalKeys(["user:x"])

    expect(callback).not.toHaveBeenCalled()
    teardown() // should not throw
  })

  it("does not propagate listener exceptions back to the broadcaster", () => {
    subscribeToSignals(["user:x"], () => {
      throw new Error("subscriber blew up")
    })

    // Must not throw — webhook callers can't be blocked by misbehaving subscribers.
    expect(() => broadcastSignalKeys(["user:x"])).not.toThrow()
  })
})
