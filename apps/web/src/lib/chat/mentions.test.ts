import { describe, expect, it } from "vitest"
import {
  buildListedUserSuggestions,
  composeMentionMessage,
  getMentionTrigger,
  replaceMentionTrigger,
  type ListedUserMention,
} from "./mentions"

const blacklisted: ListedUserMention[] = [
  {
    username: "octocat",
    status: "blacklisted",
    avatarUrl: "https://github.com/octocat.png",
  },
]

const whitelisted: ListedUserMention[] = [
  {
    username: "hubot",
    status: "whitelisted",
    avatarUrl: "https://github.com/hubot.png",
  },
  {
    username: "mona",
    status: "whitelisted",
    avatarUrl: "https://github.com/mona.png",
  },
]

describe("mention helpers", () => {
  it("detects the active @ query before the cursor", () => {
    expect(getMentionTrigger("check @hu", 9)).toEqual({
      query: "hu",
      start: 6,
      end: 9,
    })
  })

  it("ignores @ characters that are not the active token", () => {
    expect(getMentionTrigger("email test@example.com", 22)).toBeNull()
  })

  it("filters listed users and skips selected usernames", () => {
    expect(
      buildListedUserSuggestions(blacklisted, whitelisted, "mo", ["octocat"])
    ).toEqual([
      {
        username: "mona",
        status: "whitelisted",
        avatarUrl: "https://github.com/mona.png",
      },
    ])
  })

  it("removes the typed trigger after selecting a chip", () => {
    const trigger = getMentionTrigger("please check @hu", 16)

    expect(trigger).not.toBeNull()
    expect(replaceMentionTrigger("please check @hu", trigger!)).toBe(
      "please check"
    )
  })

  it("serializes mention chips before the freeform message", () => {
    expect(composeMentionMessage([whitelisted[0]], "what changed?")).toBe(
      "@hubot what changed?"
    )
  })
})
