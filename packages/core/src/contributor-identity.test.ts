import { describe, it, expect } from "vitest"
import { isBotSender, isBotOrGhost } from "./contributor-identity"

describe("isBotSender", () => {
  it("treats GitHub type 'Bot' as a bot regardless of login", () => {
    expect(isBotSender("tembo", "Bot")).toBe(true)
    expect(isBotSender("anything", "Bot")).toBe(true)
  })

  it("detects conventional bot login suffixes", () => {
    expect(isBotSender("coderabbitai[bot]")).toBe(true)
    expect(isBotSender("dependabot[bot]")).toBe(true)
    expect(isBotSender("tembo-bot")).toBe(true)
    expect(isBotSender("some_bot")).toBe(true)
  })

  it("is case-insensitive on the login suffix", () => {
    expect(isBotSender("CodeRabbitAI[Bot]")).toBe(true)
  })

  it("does not flag normal users or empty senders", () => {
    expect(isBotSender("octocat", "User")).toBe(false)
    expect(isBotSender("abbot")).toBe(false)
    expect(isBotSender("robotic")).toBe(false)
    expect(isBotSender("")).toBe(false)
    expect(isBotSender(null)).toBe(false)
    expect(isBotSender(undefined)).toBe(false)
  })
})

describe("isBotOrGhost", () => {
  it("flags bots, ghosts, and missing usernames", () => {
    expect(isBotOrGhost("dependabot[bot]")).toBe(true)
    expect(isBotOrGhost("ghost")).toBe(true)
    expect(isBotOrGhost(null)).toBe(true)
    expect(isBotOrGhost("octocat")).toBe(false)
  })
})
