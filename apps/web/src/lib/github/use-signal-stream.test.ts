import { describe, expect, it } from "vitest"
import { __internal } from "./use-signal-stream"

const { buildStreamUrl, invalidateMatching, isServerMessage } = __internal

describe("buildStreamUrl", () => {
  it("encodes signal keys as a comma-separated query param", () => {
    expect(buildStreamUrl(["user:torvalds", "repo:torvalds/linux"])).toBe(
      "/api/github/signals/stream?keys=user%3Atorvalds%2Crepo%3Atorvalds%2Flinux",
    )
  })

  it("produces the same URL regardless of array identity (stable for memoization)", () => {
    const a = buildStreamUrl(["user:x", "repo:y/z"])
    const b = buildStreamUrl(["user:x", "repo:y/z"])
    expect(a).toBe(b)
  })
})

describe("isServerMessage", () => {
  it("accepts well-formed {type:'signals', keys:string[]}", () => {
    expect(
      isServerMessage({ type: "signals", keys: ["user:x", "repo:y/z"] }),
    ).toBe(true)
  })

  it("rejects wrong type field", () => {
    expect(isServerMessage({ type: "ping", keys: [] })).toBe(false)
  })

  it("rejects non-string entries in keys array", () => {
    expect(isServerMessage({ type: "signals", keys: [1, 2] })).toBe(false)
  })

  it("rejects null / undefined / non-object input", () => {
    expect(isServerMessage(null)).toBe(false)
    expect(isServerMessage(undefined)).toBe(false)
    expect(isServerMessage("data")).toBe(false)
  })

  it("rejects missing keys field", () => {
    expect(isServerMessage({ type: "signals" })).toBe(false)
  })
})

describe("invalidateMatching", () => {
  // Build a minimal queryClient stub for unit-testable behavior.
  // We test the FILTERING logic (which targets get invalidated) without
  // exercising react-query internals.
  type MockState = {
    dataUpdatedAt: number
    fetchStatus: "idle" | "fetching" | "paused"
  }

  function createMockClient(
    statesByKey: Record<string, MockState | undefined>,
  ) {
    const invalidated: ReadonlyArray<unknown>[] = []
    const client = {
      getQueryState(key: ReadonlyArray<unknown>) {
        return statesByKey[JSON.stringify(key)]
      },
      invalidateQueries({ queryKey }: { queryKey: ReadonlyArray<unknown> }) {
        invalidated.push(queryKey)
        return Promise.resolve()
      },
    }
    return { client, invalidated }
  }

  it("invalidates only targets whose signalKeys intersect the received keys", () => {
    const targetA = {
      queryKey: ["github", "a"],
      signalKeys: ["user:torvalds"],
    }
    const targetB = {
      queryKey: ["github", "b"],
      signalKeys: ["user:other"],
    }
    const { client, invalidated } = createMockClient({
      [JSON.stringify(targetA.queryKey)]: {
        dataUpdatedAt: 100,
        fetchStatus: "idle",
      },
      [JSON.stringify(targetB.queryKey)]: {
        dataUpdatedAt: 100,
        fetchStatus: "idle",
      },
    })

    const count = invalidateMatching(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
      client as any,
      [targetA, targetB],
      ["user:torvalds"],
    )

    expect(count).toBe(1)
    expect(invalidated).toEqual([targetA.queryKey])
  })

  it("skips queries that have no data yet (dataUpdatedAt === 0)", () => {
    const target = {
      queryKey: ["github", "a"],
      signalKeys: ["user:x"],
    }
    const { client, invalidated } = createMockClient({
      [JSON.stringify(target.queryKey)]: {
        dataUpdatedAt: 0,
        fetchStatus: "idle",
      },
    })

    const count = invalidateMatching(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
      client as any,
      [target],
      ["user:x"],
    )

    expect(count).toBe(0)
    expect(invalidated).toEqual([])
  })

  it("skips queries that are already fetching (avoids cancelling an in-flight refresh)", () => {
    const target = {
      queryKey: ["github", "a"],
      signalKeys: ["user:x"],
    }
    const { client, invalidated } = createMockClient({
      [JSON.stringify(target.queryKey)]: {
        dataUpdatedAt: 100,
        fetchStatus: "fetching",
      },
    })

    const count = invalidateMatching(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
      client as any,
      [target],
      ["user:x"],
    )

    expect(count).toBe(0)
    expect(invalidated).toEqual([])
  })

  it("skips queries that have no state at all (not yet mounted)", () => {
    const target = {
      queryKey: ["github", "a"],
      signalKeys: ["user:x"],
    }
    const { client, invalidated } = createMockClient({})

    const count = invalidateMatching(
      // biome-ignore lint/suspicious/noExplicitAny: minimal stub for unit test
      client as any,
      [target],
      ["user:x"],
    )

    expect(count).toBe(0)
    expect(invalidated).toEqual([])
  })
})
