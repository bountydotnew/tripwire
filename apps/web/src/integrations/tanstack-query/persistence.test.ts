import { describe, expect, it } from "vitest"
import {
  __internal,
  isPersistedStateUsable,
  shouldPersistQuery,
} from "./persistence"

const { PERSIST_TTL_MS } = __internal

describe("shouldPersistQuery", () => {
  it("returns true only when status is success, data is non-null, and meta.persist is true", () => {
    expect(
      shouldPersistQuery({
        state: { status: "success", data: { foo: 1 } },
        meta: { persist: true },
        queryKey: ["a"],
      }),
    ).toBe(true)
  })

  it("returns false when meta.persist is missing or false", () => {
    expect(
      shouldPersistQuery({
        state: { status: "success", data: { foo: 1 } },
        queryKey: ["a"],
      }),
    ).toBe(false)
    expect(
      shouldPersistQuery({
        state: { status: "success", data: { foo: 1 } },
        meta: { persist: false },
        queryKey: ["a"],
      }),
    ).toBe(false)
  })

  it("returns false when status is not 'success'", () => {
    expect(
      shouldPersistQuery({
        state: { status: "pending" },
        meta: { persist: true },
        queryKey: ["a"],
      }),
    ).toBe(false)
    expect(
      shouldPersistQuery({
        state: { status: "error" },
        meta: { persist: true },
        queryKey: ["a"],
      }),
    ).toBe(false)
  })

  it("returns false when data is null/undefined even with persist=true", () => {
    expect(
      shouldPersistQuery({
        state: { status: "success", data: null },
        meta: { persist: true },
        queryKey: ["a"],
      }),
    ).toBe(false)
    expect(
      shouldPersistQuery({
        state: { status: "success" },
        meta: { persist: true },
        queryKey: ["a"],
      }),
    ).toBe(false)
  })

  it("rejects truthy-but-not-true meta.persist values", () => {
    // Explicit `=== true` check — only the literal `true` opts in.
    // (Guards against e.g. `meta: { persist: "tab" }` accidentally persisting.)
    expect(
      shouldPersistQuery({
        state: { status: "success", data: { foo: 1 } },
        meta: { persist: "tab" },
        queryKey: ["a"],
      }),
    ).toBe(false)
    expect(
      shouldPersistQuery({
        state: { status: "success", data: { foo: 1 } },
        meta: { persist: 1 },
        queryKey: ["a"],
      }),
    ).toBe(false)
  })
})

describe("isPersistedStateUsable", () => {
  function buildBlob(
    overrides: Partial<{
      version: number
      persistedAt: number
      clientState: unknown
    }> = {},
  ) {
    return JSON.stringify({
      version: overrides.version ?? 1,
      persistedAt: overrides.persistedAt ?? Date.now(),
      clientState: overrides.clientState ?? { queries: [] },
    })
  }

  it("returns the parsed payload for a fresh, well-formed blob", () => {
    const blob = buildBlob({ persistedAt: 1_000 })
    const result = isPersistedStateUsable(blob, 1_500)
    expect(result).not.toBeNull()
    expect(result?.version).toBe(1)
    expect(result?.persistedAt).toBe(1_000)
  })

  it("returns null when the blob is older than PERSIST_TTL_MS", () => {
    const now = 10_000
    const stale = buildBlob({ persistedAt: now - PERSIST_TTL_MS - 1 })
    expect(isPersistedStateUsable(stale, now)).toBeNull()
  })

  it("returns null for the wrong version (so future shape bumps invalidate old data)", () => {
    expect(isPersistedStateUsable(buildBlob({ version: 2 }))).toBeNull()
    expect(isPersistedStateUsable(buildBlob({ version: 0 }))).toBeNull()
  })

  it("returns null for malformed JSON without throwing", () => {
    expect(isPersistedStateUsable("not-json")).toBeNull()
    expect(isPersistedStateUsable("{")).toBeNull()
  })

  it("returns null when persistedAt is missing or wrong type", () => {
    expect(
      isPersistedStateUsable(
        JSON.stringify({ version: 1, clientState: {} }),
      ),
    ).toBeNull()
    expect(
      isPersistedStateUsable(
        JSON.stringify({
          version: 1,
          persistedAt: "yesterday",
          clientState: {},
        }),
      ),
    ).toBeNull()
  })

  it("returns null when raw is null/empty (no persisted state)", () => {
    expect(isPersistedStateUsable(null)).toBeNull()
    expect(isPersistedStateUsable("")).toBeNull()
  })
})
