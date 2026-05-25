import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Focused tests for the webhook-idempotency helpers in cache.ts.
 * Lives in a separate file because it needs to mock `@tripwire/db`
 * imports — keeping it out of cache.test.ts avoids polluting the
 * store-injection style there.
 */

/** Captures every SQL builder call so assertions can introspect them. */
type DbCall =
  | { kind: "insert"; table: unknown }
  | { kind: "update"; table: unknown }
  | { kind: "values"; values: unknown }
  | { kind: "set"; values: unknown }
  | { kind: "where"; condition: unknown }
  | { kind: "onConflictDoNothing"; target: unknown }
  | { kind: "returning" }

let recorded: DbCall[] = []
let insertReturnsRows: { id: number }[] = []

/**
 * Minimal chainable stub matching the Drizzle query-builder surface the
 * helpers under test use. Records every method call so tests can assert
 * the right SQL was constructed; `insert(...).returning()` returns the
 * configured row set so we can simulate first-write vs duplicate.
 */
function buildChain() {
  const chain = {
    values(values: unknown) {
      recorded.push({ kind: "values", values })
      return chain
    },
    set(values: unknown) {
      recorded.push({ kind: "set", values })
      return chain
    },
    where(condition: unknown) {
      recorded.push({ kind: "where", condition })
      // `update().set().where()` is awaited directly — return a thenable.
      return Promise.resolve()
    },
    onConflictDoNothing(target: unknown) {
      recorded.push({ kind: "onConflictDoNothing", target })
      return chain
    },
    returning() {
      recorded.push({ kind: "returning" })
      // Mimic Drizzle's "returns array of rows that were inserted" —
      // empty array = nothing inserted (conflict), non-empty = new row.
      return Promise.resolve(insertReturnsRows)
    },
  }
  return chain
}

vi.mock("@tripwire/db/client", () => ({
  db: {
    insert(table: unknown) {
      recorded.push({ kind: "insert", table })
      return buildChain()
    },
    update(table: unknown) {
      recorded.push({ kind: "update", table })
      return buildChain()
    },
  },
}))

vi.mock("@tripwire/db", () => ({
  githubWebhookEvent: {
    __tableName: "github_webhook_event",
    deliveryId: { __column: "delivery_id" },
    id: { __column: "id" },
  },
}))

vi.mock("drizzle-orm", () => ({
  eq: (column: unknown, value: unknown) => ({ __op: "eq", column, value }),
}))

import {
  markGitHubWebhookEventFailed,
  markGitHubWebhookEventProcessed,
  recordGitHubWebhookEvent,
} from "./cache"

beforeEach(() => {
  recorded = []
  insertReturnsRows = []
})

describe("recordGitHubWebhookEvent", () => {
  it("returns true when the insert produced a new row (first delivery)", async () => {
    insertReturnsRows = [{ id: 42 }]
    const result = await recordGitHubWebhookEvent({
      deliveryId: "uuid-1",
      event: "pull_request",
      signalKeys: ["user:torvalds"],
      receivedAt: 1_000,
    })
    expect(result).toBe(true)
  })

  it("returns false when the insert conflicted (retry of same delivery)", async () => {
    insertReturnsRows = []
    const result = await recordGitHubWebhookEvent({
      deliveryId: "uuid-1",
      event: "pull_request",
      signalKeys: [],
    })
    expect(result).toBe(false)
  })

  it("serializes signalKeys as JSON in the values clause", async () => {
    insertReturnsRows = [{ id: 1 }]
    await recordGitHubWebhookEvent({
      deliveryId: "uuid-1",
      event: "issues",
      signalKeys: ["user:alice", "repo:owner/name"],
      receivedAt: 500,
    })
    const valuesCall = recorded.find((c) => c.kind === "values") as
      | { kind: "values"; values: { signalKeysJson: string; receivedAt: number } }
      | undefined
    expect(valuesCall).toBeDefined()
    expect(JSON.parse(valuesCall?.values.signalKeysJson ?? "[]")).toEqual([
      "user:alice",
      "repo:owner/name",
    ])
    expect(valuesCall?.values.receivedAt).toBe(500)
  })

  it("uses onConflictDoNothing on the deliveryId column so retries are no-ops", async () => {
    insertReturnsRows = []
    await recordGitHubWebhookEvent({
      deliveryId: "uuid-1",
      event: "pull_request",
      signalKeys: [],
    })
    const conflict = recorded.find(
      (c) => c.kind === "onConflictDoNothing",
    ) as { kind: "onConflictDoNothing"; target: { target: unknown } } | undefined
    expect(conflict).toBeDefined()
    // Drizzle's onConflictDoNothing takes `{ target: column }` — the call
    // arg captured here is that wrapper object.
    expect(conflict?.target).toEqual({ target: { __column: "delivery_id" } })
  })

  it("defaults receivedAt to Date.now() when omitted", async () => {
    insertReturnsRows = [{ id: 1 }]
    const before = Date.now()
    await recordGitHubWebhookEvent({
      deliveryId: "uuid-1",
      event: "issues",
      signalKeys: [],
    })
    const after = Date.now()
    const valuesCall = recorded.find((c) => c.kind === "values") as
      | { kind: "values"; values: { receivedAt: number } }
      | undefined
    expect(valuesCall?.values.receivedAt).toBeGreaterThanOrEqual(before)
    expect(valuesCall?.values.receivedAt).toBeLessThanOrEqual(after)
  })
})

describe("markGitHubWebhookEventProcessed", () => {
  it("updates processedAt and clears any prior errorMessage", async () => {
    await markGitHubWebhookEventProcessed("uuid-1", 2_000)
    const setCall = recorded.find((c) => c.kind === "set") as
      | { kind: "set"; values: { processedAt: number; errorMessage: null } }
      | undefined
    expect(setCall?.values).toEqual({
      processedAt: 2_000,
      errorMessage: null,
    })
  })

  it("filters by deliveryId", async () => {
    await markGitHubWebhookEventProcessed("uuid-1")
    const whereCall = recorded.find((c) => c.kind === "where") as
      | { kind: "where"; condition: { value: string } }
      | undefined
    expect(whereCall?.condition).toMatchObject({
      __op: "eq",
      value: "uuid-1",
    })
  })
})

describe("markGitHubWebhookEventFailed", () => {
  it("writes the error message verbatim when under the 2k limit", async () => {
    await markGitHubWebhookEventFailed("uuid-1", "Something broke")
    const setCall = recorded.find((c) => c.kind === "set") as
      | { kind: "set"; values: { errorMessage: string } }
      | undefined
    expect(setCall?.values.errorMessage).toBe("Something broke")
  })

  it("truncates very long error messages to 2000 chars", async () => {
    const huge = "x".repeat(5_000)
    await markGitHubWebhookEventFailed("uuid-1", huge)
    const setCall = recorded.find((c) => c.kind === "set") as
      | { kind: "set"; values: { errorMessage: string } }
      | undefined
    expect(setCall?.values.errorMessage).toHaveLength(2_000)
  })
})
