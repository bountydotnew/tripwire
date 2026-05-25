import { describe, expect, it } from "vitest"
import { nextVisibilityState, type VisibilityState } from "./use-refresh-on-return"

describe("nextVisibilityState", () => {
  it("on initial visible state (no prior hidden), does nothing", () => {
    const start: VisibilityState = { wasHidden: false }
    const result = nextVisibilityState(start, { hidden: false })
    expect(result.shouldRefresh).toBe(false)
    expect(result.next).toEqual({ wasHidden: false })
  })

  it("records the hidden transition without refreshing", () => {
    const start: VisibilityState = { wasHidden: false }
    const result = nextVisibilityState(start, { hidden: true })
    expect(result.shouldRefresh).toBe(false)
    expect(result.next).toEqual({ wasHidden: true })
  })

  it("on hidden→visible transition, refreshes and resets the flag", () => {
    const start: VisibilityState = { wasHidden: true }
    const result = nextVisibilityState(start, { hidden: false })
    expect(result.shouldRefresh).toBe(true)
    expect(result.next).toEqual({ wasHidden: false })
  })

  it("only refreshes once per round-trip — a second visible event without intervening hidden is a no-op", () => {
    // Simulate: was hidden → became visible (refresh fires, flag resets)
    // → became visible again somehow (e.g. spurious event). No re-refresh.
    const a = nextVisibilityState({ wasHidden: true }, { hidden: false })
    expect(a.shouldRefresh).toBe(true)
    const b = nextVisibilityState(a.next, { hidden: false })
    expect(b.shouldRefresh).toBe(false)
  })

  it("hidden→hidden updates do not unset the flag (we're still 'going away')", () => {
    const start: VisibilityState = { wasHidden: true }
    const result = nextVisibilityState(start, { hidden: true })
    expect(result.next.wasHidden).toBe(true)
    expect(result.shouldRefresh).toBe(false)
  })

  it("survives a full round-trip across multiple transitions", () => {
    // visible (init) → hidden → visible (refresh) → hidden → visible (refresh again)
    let s: VisibilityState = { wasHidden: false }
    let r = nextVisibilityState(s, { hidden: true })
    s = r.next
    expect(r.shouldRefresh).toBe(false)

    r = nextVisibilityState(s, { hidden: false })
    s = r.next
    expect(r.shouldRefresh).toBe(true)

    r = nextVisibilityState(s, { hidden: true })
    s = r.next
    expect(r.shouldRefresh).toBe(false)

    r = nextVisibilityState(s, { hidden: false })
    expect(r.shouldRefresh).toBe(true)
  })
})
