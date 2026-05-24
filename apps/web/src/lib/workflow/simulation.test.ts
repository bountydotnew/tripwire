import { describe, it, expect } from "vitest"
import {
  simulateWorkflowDefinition,
  workflowSupportsManualRun,
  type RunReportUserData,
} from "./simulation"

const baseUserData: RunReportUserData = {
  user: { login: "grim", avatarUrl: "", name: null },
  data: {
    accountAgeDays: 365,
    followers: 100,
    publicRepos: 12,
    nonForkRepos: 5,
    hasProfileReadme: true,
    mergedPrs: 20,
    score: 88,
  },
}

const accountAgeRulePassWorkflow = {
  id: "wf-1",
  name: "Account Age Gate",
  definition: {
    nodes: [
      { id: "t", type: "trigger", data: { trigger: "pr_opened" } },
      {
        id: "r",
        type: "rule",
        data: { rule: "accountAge", params: { days: 30 } },
      },
      { id: "a", type: "action", data: { action: "log", message: "welcome" } },
    ],
    edges: [
      { id: "e1", source: "t", target: "r" },
      { id: "e2", source: "r", target: "a", sourceHandle: "pass" },
    ],
  },
}

describe("simulateWorkflowDefinition", () => {
  it("runs the workflow through the real block evaluators end-to-end", () => {
    const result = simulateWorkflowDefinition(
      accountAgeRulePassWorkflow,
      baseUserData
    )
    expect(result.workflowId).toBe("wf-1")
    expect(result.nodeCount).toBe(3)
    expect(result.result).toBe("allowed")
    expect(result.outcomes.find((o) => o.nodeId === "r")?.status).toBe("pass")
    expect(result.outcomes.find((o) => o.nodeId === "a")?.status).toBe(
      "executed"
    )
  })

  it("routes to the fail branch when the rule fails", () => {
    const wf = {
      id: "wf-2",
      name: "Strict Age",
      definition: {
        nodes: [
          { id: "t", type: "trigger", data: { trigger: "pr_opened" } },
          {
            id: "r",
            type: "rule",
            data: { rule: "accountAge", params: { days: 1000 } },
          },
          { id: "ok", type: "action", data: { action: "log" } },
          { id: "block", type: "action", data: { action: "block" } },
        ],
        edges: [
          { id: "e1", source: "t", target: "r" },
          { id: "e2", source: "r", target: "ok", sourceHandle: "pass" },
          { id: "e3", source: "r", target: "block", sourceHandle: "fail" },
        ],
      },
    }
    const result = simulateWorkflowDefinition(wf, baseUserData)
    expect(result.result).toBe("blocked")
    expect(result.outcomes.find((o) => o.nodeId === "r")?.status).toBe("fail")
    expect(result.outcomes.find((o) => o.nodeId === "block")?.status).toBe(
      "executed"
    )
    expect(result.outcomes.find((o) => o.nodeId === "ok")?.status).toBe(
      "skipped"
    )
  })

  it("regression: repoActivityMinimum fires against nonForkRepos signal value", () => {
    const wf = {
      id: "wf-3",
      name: "Repo Activity",
      definition: {
        nodes: [
          { id: "t", type: "trigger", data: { trigger: "pr_opened" } },
          {
            id: "r",
            type: "rule",
            data: { rule: "repoActivityMinimum", params: { minRepos: 3 } },
          },
        ],
        edges: [{ id: "e1", source: "t", target: "r" }],
      },
    }
    const pass = simulateWorkflowDefinition(wf, baseUserData)
    expect(pass.outcomes.find((o) => o.nodeId === "r")?.status).toBe("pass")

    const fail = simulateWorkflowDefinition(wf, {
      ...baseUserData!,
      data: { ...baseUserData!.data, nonForkRepos: 1 },
    })
    expect(fail.outcomes.find((o) => o.nodeId === "r")?.status).toBe("fail")
  })

  it("returns no-action when no actions are reached", () => {
    const wf = {
      id: "wf-4",
      name: "Just trigger",
      definition: {
        nodes: [{ id: "t", type: "trigger", data: { trigger: "pr_opened" } }],
        edges: [],
      },
    }
    const result = simulateWorkflowDefinition(wf, baseUserData)
    expect(result.result).toBe("no-action")
    expect(result.actions).toEqual([])
  })

  it("passes contentText through so language and crypto rules see body text", () => {
    const wf = {
      id: "wf-5",
      name: "Crypto guard",
      definition: {
        nodes: [
          { id: "t", type: "trigger", data: { trigger: "issue_opened" } },
          { id: "r", type: "rule", data: { rule: "crypto" } },
        ],
        edges: [{ id: "e1", source: "t", target: "r" }],
      },
    }
    const clean = simulateWorkflowDefinition(
      wf,
      baseUserData,
      "Just a normal issue body"
    )
    expect(clean.outcomes.find((o) => o.nodeId === "r")?.status).toBe("pass")

    const dirty = simulateWorkflowDefinition(
      wf,
      baseUserData,
      "Send 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb7 please"
    )
    expect(dirty.outcomes.find((o) => o.nodeId === "r")?.status).toBe("fail")
  })
})

describe("workflowSupportsManualRun", () => {
  it("returns true when the workflow has a manual trigger", () => {
    expect(
      workflowSupportsManualRun({
        definition: {
          nodes: [{ type: "trigger", data: { trigger: "manual" } }],
        },
      })
    ).toBe(true)
  })

  it("returns false when no manual trigger is present", () => {
    expect(
      workflowSupportsManualRun({
        definition: {
          nodes: [{ type: "trigger", data: { trigger: "pr_opened" } }],
        },
      })
    ).toBe(false)
  })
})
