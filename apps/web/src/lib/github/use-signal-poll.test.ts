import { describe, expect, it } from "vitest"
import { __internal } from "./use-signal-poll"

const { collectKeysToInvalidate, signalCompositeKey } = __internal

describe("signalCompositeKey", () => {
  it("produces stable composite keys keyed by both queryKey and signalKey", () => {
    // `\0` delimiter (matches diffkit) so a signalKey containing spaces
    // can't accidentally collide with another (queryKey, signalKey) pair.
    expect(signalCompositeKey(["github", "viewer"], "user:torvalds")).toBe(
      `${JSON.stringify(["github", "viewer"])}\0user:torvalds`,
    )
    expect(
      signalCompositeKey(["github", "viewer"], "user:torvalds"),
    ).toBe(signalCompositeKey(["github", "viewer"], "user:torvalds"))
  })

  it("distinguishes the same signalKey across different queryKeys", () => {
    expect(signalCompositeKey(["github", "a"], "user:x")).not.toBe(
      signalCompositeKey(["github", "b"], "user:x"),
    )
  })
})

describe("collectKeysToInvalidate", () => {
  it("seeds lastSeen on first sighting without invalidating", () => {
    const lastSeen = new Map<string, number>()
    const result = collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:torvalds"] }],
      [{ signalKey: "user:torvalds", updatedAt: 1_000 }],
      lastSeen,
    )
    expect(result).toEqual([])
    expect(lastSeen.size).toBe(1)
  })

  it("returns the signal key when the timestamp advances", () => {
    const lastSeen = new Map<string, number>()
    collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:torvalds"] }],
      [{ signalKey: "user:torvalds", updatedAt: 1_000 }],
      lastSeen,
    )
    const second = collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:torvalds"] }],
      [{ signalKey: "user:torvalds", updatedAt: 2_000 }],
      lastSeen,
    )
    expect(second).toEqual(["user:torvalds"])
  })

  it("does not invalidate when timestamp is unchanged", () => {
    const lastSeen = new Map<string, number>()
    collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:x"] }],
      [{ signalKey: "user:x", updatedAt: 1_000 }],
      lastSeen,
    )
    const second = collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:x"] }],
      [{ signalKey: "user:x", updatedAt: 1_000 }],
      lastSeen,
    )
    expect(second).toEqual([])
  })

  it("does not invalidate one queryKey because another queryKey already saw the signal", () => {
    const lastSeen = new Map<string, number>()
    // Query A sees the signal at t=1000.
    collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:x"] }],
      [{ signalKey: "user:x", updatedAt: 1_000 }],
      lastSeen,
    )
    // Query B mounts later and asks about the same signal at t=1000.
    // It should seed its own composite entry, not consider the signal "new".
    const result = collectKeysToInvalidate(
      [
        { queryKey: ["github", "a"], signalKeys: ["user:x"] },
        { queryKey: ["github", "b"], signalKeys: ["user:x"] },
      ],
      [{ signalKey: "user:x", updatedAt: 1_000 }],
      lastSeen,
    )
    expect(result).toEqual([])
    expect(lastSeen.size).toBe(2)
  })

  it("ignores signals not subscribed to by any target", () => {
    const lastSeen = new Map<string, number>()
    const result = collectKeysToInvalidate(
      [{ queryKey: ["github", "a"], signalKeys: ["user:torvalds"] }],
      [{ signalKey: "user:somebody-else", updatedAt: 1_000 }],
      lastSeen,
    )
    expect(result).toEqual([])
    expect(lastSeen.size).toBe(0)
  })

  it("dedupes the same signal across multiple matching targets", () => {
    const lastSeen = new Map<string, number>()
    // Both queries seed.
    collectKeysToInvalidate(
      [
        { queryKey: ["github", "a"], signalKeys: ["user:x"] },
        { queryKey: ["github", "b"], signalKeys: ["user:x"] },
      ],
      [{ signalKey: "user:x", updatedAt: 1_000 }],
      lastSeen,
    )
    // Signal bumps; both queries should invalidate but the returned key set is deduped.
    const result = collectKeysToInvalidate(
      [
        { queryKey: ["github", "a"], signalKeys: ["user:x"] },
        { queryKey: ["github", "b"], signalKeys: ["user:x"] },
      ],
      [{ signalKey: "user:x", updatedAt: 2_000 }],
      lastSeen,
    )
    expect(result).toEqual(["user:x"])
  })
})
