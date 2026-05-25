import { describe, expect, it, vi } from "vitest"
import {
  type OptimisticMutationQueryClient,
  runOptimisticMutation,
} from "./use-optimistic-mutation"

/**
 * Build an in-memory QueryClient stub that just stores keyed values.
 * Exposes the same minimal surface `runOptimisticMutation` needs +
 * an `invalidated` log so tests can assert what was invalidated.
 */
function createStubClient(initial: Map<string, unknown> = new Map()) {
  const data = new Map(initial)
  const keyByJson = new Map<string, readonly unknown[]>()
  for (const [json, _value] of initial) {
    keyByJson.set(json, JSON.parse(json))
  }
  const invalidated: string[] = []

  function applyUpdater(json: string, updater: unknown) {
    const next =
      typeof updater === "function"
        ? (updater as (current: unknown) => unknown)(data.get(json))
        : updater
    if (next === undefined) {
      // Match react-query semantics: returning undefined leaves the cache untouched.
      return
    }
    data.set(json, next)
  }

  const client: OptimisticMutationQueryClient = {
    getQueryData(queryKey) {
      return data.get(JSON.stringify(queryKey))
    },
    setQueryData(queryKey, updater) {
      const json = JSON.stringify(queryKey)
      keyByJson.set(json, queryKey as readonly unknown[])
      applyUpdater(json, updater)
      return data.get(json)
    },
    getQueriesData({ predicate }) {
      const matches: Array<[readonly unknown[], unknown]> = []
      for (const [json, queryKey] of keyByJson) {
        if (predicate({ queryKey })) {
          matches.push([queryKey, data.get(json)])
        }
      }
      return matches
    },
    setQueriesData({ predicate }, updater) {
      for (const [json, queryKey] of keyByJson) {
        if (predicate({ queryKey })) {
          applyUpdater(json, updater)
        }
      }
      return undefined
    },
    async invalidateQueries({ queryKey }) {
      invalidated.push(JSON.stringify(queryKey))
    },
  }
  return { client, data, invalidated }
}

describe("runOptimisticMutation", () => {
  it("applies optimistic updates before calling mutationFn", async () => {
    const { client, data } = createStubClient(
      new Map([[JSON.stringify(["repos", "abc"]), { count: 3 }]]),
    )
    let observedDuringMutation: unknown
    const mutationFn = vi.fn(async () => {
      observedDuringMutation = data.get(JSON.stringify(["repos", "abc"]))
      return { ok: true }
    })

    await runOptimisticMutation(client, {
      mutationFn,
      updates: [
        {
          queryKey: ["repos", "abc"],
          updater: (current: { count: number }) => ({ count: current.count + 1 }),
        },
      ],
    })

    expect(observedDuringMutation).toEqual({ count: 4 })
    expect(mutationFn).toHaveBeenCalledOnce()
  })

  it("skips invalidation when optimistic updates were applied AND the mutation succeeded", async () => {
    const { client, invalidated } = createStubClient(
      new Map([[JSON.stringify(["repos", "abc"]), { count: 3 }]]),
    )

    await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: true }),
      updates: [
        {
          queryKey: ["repos", "abc"],
          updater: (current: { count: number }) => ({ count: current.count + 1 }),
        },
      ],
    })

    expect(invalidated).toEqual([])
  })

  it("invalidates the configured prefix when NO optimistic updates were applied", async () => {
    const { client, invalidated } = createStubClient()

    await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: true }),
      invalidateQueryKey: ["repos"],
    })

    expect(invalidated).toEqual([JSON.stringify(["repos"])])
  })

  it("defaults the invalidation prefix to ['github'] when none is specified", async () => {
    const { client, invalidated } = createStubClient()

    await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: true }),
    })

    expect(invalidated).toEqual([JSON.stringify(["github"])])
  })

  it("rolls back to the prior snapshot when mutationFn throws", async () => {
    const before = { count: 3 }
    const { client, data } = createStubClient(
      new Map([[JSON.stringify(["repos", "abc"]), before]]),
    )

    const result = await runOptimisticMutation(client, {
      mutationFn: async () => {
        throw new Error("network down")
      },
      updates: [
        {
          queryKey: ["repos", "abc"],
          updater: (current: { count: number }) => ({ count: current.count + 1 }),
        },
      ],
    })

    expect(result).toBeUndefined()
    expect(data.get(JSON.stringify(["repos", "abc"]))).toBe(before)
  })

  it("rolls back when isSuccess returns false (treats result-as-failure same as throw)", async () => {
    const before = { count: 3 }
    const { client, data } = createStubClient(
      new Map([[JSON.stringify(["repos", "abc"]), before]]),
    )

    const result = await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: false, error: "denied" }),
      isSuccess: (r: { ok: boolean }) => r.ok,
      updates: [
        {
          queryKey: ["repos", "abc"],
          updater: (current: { count: number }) => ({ count: current.count + 1 }),
        },
      ],
    })

    expect(result).toEqual({ ok: false, error: "denied" })
    expect(data.get(JSON.stringify(["repos", "abc"]))).toBe(before)
  })

  it("does not touch query slots that haven't been populated yet", async () => {
    const { client, data } = createStubClient()
    const updaterSpy = vi.fn((current: { count: number }) => ({
      count: current.count + 1,
    }))

    await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: true }),
      updates: [{ queryKey: ["repos", "uncached"], updater: updaterSpy }],
    })

    // No prior entry → updater is never called, cache still empty.
    expect(updaterSpy).not.toHaveBeenCalled()
    expect(data.size).toBe(0)
  })

  it("rolls back multiple snapshots independently", async () => {
    const before1 = { v: 1 }
    const before2 = { v: 2 }
    const { client, data } = createStubClient(
      new Map([
        [JSON.stringify(["a"]), before1],
        [JSON.stringify(["b"]), before2],
      ]),
    )

    await runOptimisticMutation(client, {
      mutationFn: async () => {
        throw new Error("nope")
      },
      updates: [
        {
          queryKey: ["a"],
          updater: (c: { v: number }) => ({ v: c.v + 100 }),
        },
        {
          queryKey: ["b"],
          updater: (c: { v: number }) => ({ v: c.v + 100 }),
        },
      ],
    })

    expect(data.get(JSON.stringify(["a"]))).toBe(before1)
    expect(data.get(JSON.stringify(["b"]))).toBe(before2)
  })

  it("returns the mutationFn result on success so callers can chain on it", async () => {
    const { client } = createStubClient()
    const result = await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: true, value: 42 }),
    })
    expect(result).toEqual({ ok: true, value: 42 })
  })

  it("returns the (unsuccessful) result when isSuccess says no — caller can branch on error", async () => {
    const { client } = createStubClient()
    const result = await runOptimisticMutation(client, {
      mutationFn: async () => ({ ok: false, error: "denied" }),
      isSuccess: (r: { ok: boolean }) => r.ok,
    })
    expect(result).toEqual({ ok: false, error: "denied" })
  })

  describe("predicate-based updates", () => {
    it("applies the updater to every cache slot whose queryKey matches the predicate", async () => {
      // Two list variants (different search params) that both contain the
      // same row. A single predicate update patches both.
      const list1 = {
        items: [{ name: "torvalds", status: "neutral" }],
      }
      const list2 = {
        items: [
          { name: "torvalds", status: "neutral" },
          { name: "linus", status: "neutral" },
        ],
      }
      const { client, data } = createStubClient(
        new Map<string, unknown>([
          [JSON.stringify(["contributors", { repoId: "r1", search: "" }]), list1],
          [JSON.stringify(["contributors", { repoId: "r1", search: "tor" }]), list2],
          [JSON.stringify(["events"]), { unrelated: true }],
        ]),
      )

      await runOptimisticMutation(client, {
        mutationFn: async () => ({ ok: true }),
        updates: [
          {
            predicate: (queryKey) =>
              JSON.stringify(queryKey).includes('"repoId":"r1"'),
            updater: (current: { items: Array<{ name: string; status: string }> }) => ({
              items: current.items.map((row) =>
                row.name === "torvalds" ? { ...row, status: "whitelisted" } : row,
              ),
            }),
          },
        ],
      })

      const patched1 = data.get(
        JSON.stringify(["contributors", { repoId: "r1", search: "" }]),
      ) as { items: Array<{ name: string; status: string }> }
      const patched2 = data.get(
        JSON.stringify(["contributors", { repoId: "r1", search: "tor" }]),
      ) as { items: Array<{ name: string; status: string }> }
      expect(patched1.items[0]?.status).toBe("whitelisted")
      expect(patched2.items[0]?.status).toBe("whitelisted")
      // Unrelated query left alone.
      expect(data.get(JSON.stringify(["events"]))).toEqual({ unrelated: true })
    })

    it("rolls back every matched slot to its original snapshot on failure", async () => {
      const before1 = { items: [{ name: "a", status: "neutral" }] }
      const before2 = { items: [{ name: "a", status: "neutral" }] }
      const { client, data } = createStubClient(
        new Map([
          [JSON.stringify(["contributors", { variant: "1" }]), before1],
          [JSON.stringify(["contributors", { variant: "2" }]), before2],
        ]),
      )

      await runOptimisticMutation(client, {
        mutationFn: async () => {
          throw new Error("nope")
        },
        updates: [
          {
            predicate: (queryKey) =>
              Array.isArray(queryKey) && queryKey[0] === "contributors",
            updater: (current: {
              items: Array<{ name: string; status: string }>
            }) => ({
              items: current.items.map((row) => ({ ...row, status: "whitelisted" })),
            }),
          },
        ],
      })

      expect(
        data.get(JSON.stringify(["contributors", { variant: "1" }])),
      ).toBe(before1)
      expect(
        data.get(JSON.stringify(["contributors", { variant: "2" }])),
      ).toBe(before2)
    })

    it("treats a predicate-based update as 'optimistic was applied' even if zero slots matched (no immediate invalidation)", async () => {
      // Edge case: caller marked the mutation as optimistic but nothing
      // was actually patched (e.g. the relevant list isn't mounted right now).
      // We still skip invalidation so we don't trigger an unnecessary fetch —
      // the signal-stream will bring fresh data when needed.
      const { client, invalidated } = createStubClient()
      await runOptimisticMutation(client, {
        mutationFn: async () => ({ ok: true }),
        updates: [
          {
            predicate: () => false,
            updater: (current: unknown) => current,
          },
        ],
      })
      expect(invalidated).toEqual([])
    })
  })
})
