import { describe, it, expect, vi } from "vitest"

// The tool definitions import the drizzle client at module load; stub it so
// importing the registry never tries to open a real DB connection.
vi.mock("@tripwire/db/client", () => ({ db: {} }))

import { tripwireTools, selectMcpSurface } from "./index"

// Irreversible / high-blast-radius ops. These must never appear on the MCP
// surface unless irreversible ops are explicitly enabled.
const IRREVERSIBLE_TOOLS = [
  "reset_contributor_score",
  "delete_workflow",
  "delete_custom_rule",
  "copy_rules",
]

// Reversible writes — exposed once writes are on.
const REVERSIBLE_WRITES = [
  "add_to_blacklist",
  "remove_from_blacklist",
  "add_to_whitelist",
  "toggle_rule",
  "set_account_age",
]

// Reads the recipe relies on — always present.
const EXPECTED_READS = [
  "list_repos",
  "list_events",
  "lookup_user",
  "get_repo_rules",
  "list_lists",
  "get_guide",
]

const namesOf = (opts: {
  allowWrites: boolean
  allowIrreversible: boolean
}): Set<string> =>
  new Set(selectMcpSurface(tripwireTools, opts).map((t) => t.name))

describe("selectMcpSurface tiers", () => {
  it("read-only mode: reads only, every write excluded", () => {
    const names = namesOf({ allowWrites: false, allowIrreversible: false })
    for (const r of EXPECTED_READS) expect(names).toContain(r)
    for (const w of [...REVERSIBLE_WRITES, ...IRREVERSIBLE_TOOLS]) {
      expect(names, `${w} must be excluded in read-only mode`).not.toContain(w)
    }
  })

  it("writes mode: reversible writes in, irreversible ops kill-switched out", () => {
    const names = namesOf({ allowWrites: true, allowIrreversible: false })
    for (const r of EXPECTED_READS) expect(names).toContain(r)
    for (const w of REVERSIBLE_WRITES) expect(names).toContain(w)
    for (const d of IRREVERSIBLE_TOOLS) {
      expect(
        names,
        `${d} must stay off the default write surface`
      ).not.toContain(d)
    }
  })

  it("full mode: irreversible ops only appear when explicitly allowed", () => {
    const names = namesOf({ allowWrites: true, allowIrreversible: true })
    for (const d of IRREVERSIBLE_TOOLS) expect(names).toContain(d)
  })

  it("every tool flagged destructive is also a write (never readOnly)", () => {
    const contradictions = tripwireTools.filter(
      (t) => t.destructive === true && t.readOnly === true
    )
    expect(contradictions).toHaveLength(0)
  })
})
