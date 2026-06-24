import { describe, it, expect } from "vitest"
import {
  DEFAULT_PR_COMMENT_PREFERENCES,
  type OrgPrCommentPreferences,
} from "@tripwire/db"
import {
  renderBlockedComment,
  renderWarnedComment,
  buildAppealUrl,
  type RenderCommentInput,
} from "./pr-comment"

const BASE: Omit<RenderCommentInput, "prefs" | "outcome" | "kind"> = {
  blockReason: "Account is 3 days old (minimum: 30 days).",
  ruleName: "accountAge",
  repoFullName: "acme/api",
  username: "octocat",
  appBaseUrl: "https://tripwire.app",
}

function prefs(
  overrides: Partial<OrgPrCommentPreferences> = {}
): OrgPrCommentPreferences {
  return {
    betterAuthOrgId: "org_test",
    ...DEFAULT_PR_COMMENT_PREFERENCES,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    ...overrides,
  }
}

describe("renderBlockedComment (defaults)", () => {
  it("renders the canonical blocked PR comment", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: null,
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).toContain("> **Tripwire**: This PR was automatically closed.")
    expect(out).toContain("> Reason: Account is 3 days old (minimum: 30 days).")
    expect(out).toContain(
      "> Think this was a mistake? [Request a review as @octocat](https://tripwire.app/request/acme/api?kind=unblock&u=octocat)"
    )
    // showRuleName defaults to false
    expect(out).not.toContain("Rule:")
  })

  it("switches the subject noun for issues", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: null,
      outcome: "blocked",
      kind: "issue",
    })
    expect(out).toContain("This issue was automatically closed.")
  })
})

describe("renderBlockedComment toggles", () => {
  it("drops the reason line when showReason is off", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: prefs({ showReason: false }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).not.toContain("Reason:")
  })

  it("adds the friendly rule label when showRuleName is on", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: prefs({ showRuleName: true }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).toContain("_Rule: Account Age_")
  })

  it("falls back to the raw rule name for unknown rules", () => {
    const out = renderBlockedComment({
      ...BASE,
      ruleName: "someBrandNewRule",
      prefs: prefs({ showRuleName: true }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).toContain("_Rule: someBrandNewRule_")
  })

  it("drops the appeal link when showAppealLink is off", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: prefs({ showAppealLink: false }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).not.toContain("Request a review")
  })

  it("uses blacklist-specific appeal wording on blacklist_blocked", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: null,
      outcome: "blacklist_blocked",
      kind: "pull_request",
    })
    expect(out).toContain("**Blacklisted from this repository.**")
    expect(out).toContain("[Appeal this block as @octocat]")
  })

  it("replaces the bot display name in the leading line", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: prefs({ botDisplayName: "Acme Bot" }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).toContain("> **Acme Bot**:")
    expect(out).not.toContain("**Tripwire**:")
  })

  it("changes the leading copy by tone", () => {
    const formal = renderBlockedComment({
      ...BASE,
      prefs: prefs({ tone: "formal" }),
      outcome: "blocked",
      kind: "pull_request",
    })
    const casual = renderBlockedComment({
      ...BASE,
      prefs: prefs({ tone: "casual" }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(formal).toContain("did not meet repository policy")
    expect(casual).toContain("Heads up, we closed this PR")
  })

  it("appends the custom footer text when set", () => {
    const out = renderBlockedComment({
      ...BASE,
      prefs: prefs({ customFooterText: "Questions? Email security@acme.com" }),
      outcome: "blocked",
      kind: "pull_request",
    })
    expect(out).toContain("> Questions? Email security@acme.com")
  })
})

describe("renderWarnedComment", () => {
  it("renders the canonical warned PR comment", () => {
    const out = renderWarnedComment({
      ...BASE,
      prefs: null,
      outcome: "warned",
      kind: "pull_request",
    })
    expect(out).toContain("> **Tripwire**: Warning.")
    expect(out).toContain("> Reason: Account is 3 days old (minimum: 30 days).")
    expect(out).toContain("> _This is a warning. No action was taken._")
  })

  it("never includes an appeal or access link, even with showAppealLink on", () => {
    const out = renderWarnedComment({
      ...BASE,
      prefs: prefs({ showAppealLink: true }),
      outcome: "warned",
      kind: "pull_request",
    })
    expect(out).not.toContain("Request a review")
    expect(out).not.toContain("Request vouched access")
    expect(out).not.toContain("Appeal this block")
  })

  it("drops the warning disclaimer when showWarningDisclaimer is off", () => {
    const out = renderWarnedComment({
      ...BASE,
      prefs: prefs({ showWarningDisclaimer: false }),
      outcome: "warned",
      kind: "pull_request",
    })
    expect(out).not.toContain("This is a warning")
  })

  it("uses unable_to_verify outcome the same as warned", () => {
    const out = renderWarnedComment({
      ...BASE,
      prefs: null,
      outcome: "unable_to_verify",
      kind: "pull_request",
    })
    expect(out).toContain("> **Tripwire**: Warning.")
  })
})

describe("buildAppealUrl", () => {
  it("builds an unblock URL with username", () => {
    expect(buildAppealUrl("https://tripwire.app", "acme/api", "octocat")).toBe(
      "https://tripwire.app/request/acme/api?kind=unblock&u=octocat"
    )
  })

  it("strips a trailing slash from the base URL", () => {
    expect(buildAppealUrl("https://tripwire.app/", "acme/api", "octocat")).toBe(
      "https://tripwire.app/request/acme/api?kind=unblock&u=octocat"
    )
  })

  it("URL-encodes usernames with special characters", () => {
    expect(buildAppealUrl("https://tripwire.app", "acme/api", "a/b c")).toBe(
      "https://tripwire.app/request/acme/api?kind=unblock&u=a%2Fb%20c"
    )
  })

  it("returns a relative path when base is empty", () => {
    expect(buildAppealUrl("", "acme/api", "octocat")).toBe(
      "/request/acme/api?kind=unblock&u=octocat"
    )
  })
})
