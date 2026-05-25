import { describe, expect, it } from "vitest"
import {
  getGitHubWebhookRevalidationSignalKeys,
  githubRevalidationSignalKeys,
} from "./revalidation"

function buildRepoPayload(
  overrides: Partial<{
    owner: string
    repo: string
    sender: string
    extra: Record<string, unknown>
  }> = {},
) {
  return {
    repository: {
      name: overrides.repo ?? "linux",
      owner: { login: overrides.owner ?? "torvalds" },
    },
    sender: { login: overrides.sender ?? "torvalds" },
    ...overrides.extra,
  }
}

describe("githubRevalidationSignalKeys", () => {
  it("lowercases user keys so case-insensitive logins collapse to one slot", () => {
    expect(githubRevalidationSignalKeys.user({ username: "Torvalds" })).toBe(
      "user:torvalds",
    )
    expect(githubRevalidationSignalKeys.user({ username: "TORVALDS" })).toBe(
      "user:torvalds",
    )
  })

  it("lowercases repo keys for the same reason", () => {
    expect(
      githubRevalidationSignalKeys.repo({ owner: "Torvalds", repo: "Linux" }),
    ).toBe("repo:torvalds/linux")
  })
})

describe("getGitHubWebhookRevalidationSignalKeys", () => {
  it("returns the installationAccess key for installation events", () => {
    expect(getGitHubWebhookRevalidationSignalKeys("installation", {})).toEqual([
      "installationAccess",
    ])
    expect(
      getGitHubWebhookRevalidationSignalKeys("installation_repositories", {}),
    ).toEqual(["installationAccess"])
    expect(
      getGitHubWebhookRevalidationSignalKeys("github_app_authorization", {}),
    ).toEqual(["installationAccess"])
  })

  it("returns repo + author keys on pull_request events", () => {
    const payload = buildRepoPayload({
      extra: { pull_request: { user: { login: "alice" } } },
    })
    expect(
      getGitHubWebhookRevalidationSignalKeys("pull_request", payload),
    ).toEqual(["repo:torvalds/linux", "user:alice"])
  })

  it("falls back to just the repo key when pull_request author cannot be resolved", () => {
    const payload = buildRepoPayload({ extra: { pull_request: {} } })
    expect(
      getGitHubWebhookRevalidationSignalKeys("pull_request", payload),
    ).toEqual(["repo:torvalds/linux"])
  })

  it("returns repo + author keys on issues events", () => {
    const payload = buildRepoPayload({
      extra: { issue: { user: { login: "Bob" } } },
    })
    expect(getGitHubWebhookRevalidationSignalKeys("issues", payload)).toEqual([
      "repo:torvalds/linux",
      "user:bob",
    ])
  })

  it("returns repo + sender keys on issue_comment events", () => {
    const payload = buildRepoPayload({ sender: "Carol" })
    expect(
      getGitHubWebhookRevalidationSignalKeys("issue_comment", payload),
    ).toEqual(["repo:torvalds/linux", "user:carol"])
  })

  it("returns just the repo key on push/create/delete events", () => {
    const payload = buildRepoPayload()
    expect(getGitHubWebhookRevalidationSignalKeys("push", payload)).toEqual([
      "repo:torvalds/linux",
    ])
    expect(getGitHubWebhookRevalidationSignalKeys("create", payload)).toEqual([
      "repo:torvalds/linux",
    ])
    expect(getGitHubWebhookRevalidationSignalKeys("delete", payload)).toEqual([
      "repo:torvalds/linux",
    ])
  })

  it("returns no keys for unsupported events", () => {
    expect(
      getGitHubWebhookRevalidationSignalKeys("star", buildRepoPayload()),
    ).toEqual([])
    expect(getGitHubWebhookRevalidationSignalKeys("fork", null)).toEqual([])
  })

  it("returns no keys for events that depend on a repo payload but receive none", () => {
    expect(
      getGitHubWebhookRevalidationSignalKeys("pull_request", {
        pull_request: {},
      }),
    ).toEqual([])
  })
})
