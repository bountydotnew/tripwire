import { describe, it, expect } from "vitest"
import {
  ISSUE_EVAL_ACTIONS,
  PR_EVAL_ACTIONS,
  workflowTriggersForEvent,
} from "./webhook-events"

describe("webhook eval coverage", () => {
  it("re-evaluates PRs on new commits, edits, and ready_for_review", () => {
    for (const a of [
      "opened",
      "reopened",
      "synchronize",
      "edited",
      "ready_for_review",
    ]) {
      expect(PR_EVAL_ACTIONS.has(a)).toBe(true)
    }
    expect(PR_EVAL_ACTIONS.has("closed")).toBe(false)
    expect(PR_EVAL_ACTIONS.has("labeled")).toBe(false)
  })

  it("re-evaluates issues on open/reopen/edit only", () => {
    expect(ISSUE_EVAL_ACTIONS.has("edited")).toBe(true)
    expect(ISSUE_EVAL_ACTIONS.has("closed")).toBe(false)
  })
})

describe("workflowTriggersForEvent", () => {
  it("maps PR opens to pr_opened and updates to pr_edited", () => {
    expect(workflowTriggersForEvent("pull_request", "opened")).toEqual([
      "pr_opened",
    ])
    expect(
      workflowTriggersForEvent("pull_request", "ready_for_review")
    ).toEqual(["pr_opened"])
    expect(workflowTriggersForEvent("pull_request", "synchronize")).toEqual([
      "pr_edited",
    ])
    expect(workflowTriggersForEvent("pull_request", "edited")).toEqual([
      "pr_edited",
    ])
  })

  it("maps issues and comments to their triggers", () => {
    expect(workflowTriggersForEvent("issues", "opened")).toEqual([
      "issue_opened",
    ])
    expect(workflowTriggersForEvent("issues", "edited")).toEqual([
      "issue_edited",
    ])
    expect(workflowTriggersForEvent("issue_comment", "created")).toEqual([
      "comment_created",
    ])
  })
})
