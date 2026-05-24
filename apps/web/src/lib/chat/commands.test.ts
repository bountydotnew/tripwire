import { describe, expect, it } from "vitest"
import {
  CHAT_COMMANDS,
  filterCommands,
  isSlashCommandDiscovery,
  lookupSlashUsernameArgs,
  parseCommand,
} from "./commands"

describe("slash command helpers", () => {
  it("filterCommands matches partial command names", () => {
    const r = filterCommands("/look")
    expect(r.some((c) => c.command === "/lookup")).toBe(true)
  })

  it("filterCommands returns empty once input contains a space", () => {
    expect(filterCommands("/lookup @x")).toEqual([])
  })

  it("isSlashCommandDiscovery is false after a space", () => {
    expect(isSlashCommandDiscovery("/lookup")).toBe(true)
    expect(isSlashCommandDiscovery("/lookup @x")).toBe(false)
  })

  it("isSlashCommandDiscovery is false for non-matching prefixes", () => {
    expect(isSlashCommandDiscovery("/zzz")).toBe(false)
  })

  it("parseCommand extracts command and args", () => {
    const p = parseCommand("/lookup @alice")
    expect(p?.command.command).toBe("/lookup")
    expect(p?.args).toBe("@alice")
  })

  it("lookupSlashUsernameArgs dedupes @handles in appearance order", () => {
    expect(lookupSlashUsernameArgs("@ripgrim @HiHey @Ripgrim")).toEqual([
      "ripgrim",
      "HiHey",
    ])
  })

  it("/lookup buildArgs resolves to lookup_users.usernames batch", () => {
    const lookupCmd = CHAT_COMMANDS.find((c) => c.command === "/lookup")
    expect(lookupCmd?.tool).toBe("lookup_users")
    expect(lookupCmd?.buildArgs?.("@ripgrim @alice @Ripgrim ")).toEqual({
      usernames: ["ripgrim", "alice"],
    })
  })
})
