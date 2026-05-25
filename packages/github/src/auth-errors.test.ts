import { describe, expect, it } from "vitest"
import {
  compactGitHubErrorMessage,
  shouldReauthorizeGitHubApp,
} from "./auth-errors"

/**
 * Build a thrown-error shape that matches what GitHub callers see:
 * a wrapper Error with status + the API response body's message.
 * (Different SDKs surface this differently; we accept both.)
 */
function buildApiError({
  status,
  message = "",
  body = "",
}: {
  status?: number
  message?: string
  body?: string
}) {
  const err = new Error(message) as Error & {
    status?: number
    response?: { data?: { message?: string } }
  }
  if (status !== undefined) err.status = status
  if (body) err.response = { data: { message: body } }
  return err
}

describe("compactGitHubErrorMessage", () => {
  it("concatenates wrapper Error.message and response.data.message", () => {
    const err = buildApiError({
      message: "Request failed",
      body: "Bad credentials",
    })
    expect(compactGitHubErrorMessage(err)).toBe("Request failed Bad credentials")
  })

  it("returns just the wrapper message when no response body is present", () => {
    expect(compactGitHubErrorMessage(buildApiError({ message: "boom" }))).toBe(
      "boom",
    )
  })

  it("returns empty string for non-object inputs (null, undefined, primitives)", () => {
    expect(compactGitHubErrorMessage(null)).toBe("")
    expect(compactGitHubErrorMessage(undefined)).toBe("")
    expect(compactGitHubErrorMessage("string")).toBe("")
    expect(compactGitHubErrorMessage(42)).toBe("")
  })
})

describe("shouldReauthorizeGitHubApp", () => {
  it("returns true on 401 (token revoked / expired)", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({ status: 401, body: "Bad credentials" }),
      ),
    ).toBe(true)
  })

  it("returns true on 403 + 'suspended' (installation suspended)", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 403,
          body: "Installation has been suspended.",
        }),
      ),
    ).toBe(true)
  })

  it("returns true on 403 + 'new permissions' (user must re-approve)", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 403,
          body: "App has new permissions that must be granted.",
        }),
      ),
    ).toBe(true)
  })

  it("returns true on 403 + 'permission' + 'pending'", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 403,
          body: "Permission change is pending owner approval.",
        }),
      ),
    ).toBe(true)
  })

  it("returns FALSE on 403 + 'not accessible by integration' (resource scope, not install scope)", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 403,
          body: "Resource not accessible by integration",
        }),
      ),
    ).toBe(false)
  })

  it("returns true on 422 + 'installation' + 'permission'", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 422,
          body: "Installation requires new permission",
        }),
      ),
    ).toBe(true)
  })

  it("returns false on 422 without installation/permission keywords", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({
          status: 422,
          body: "Validation Failed: title cannot be blank",
        }),
      ),
    ).toBe(false)
  })

  it("returns true when the wrapper Error.message contains 'bad credentials' (no status field)", () => {
    expect(
      shouldReauthorizeGitHubApp(new Error("GitHub API: Bad credentials")),
    ).toBe(true)
  })

  it("returns true when the wrapper Error.message includes the docs.github.com/rest link", () => {
    // GitHub sometimes returns a terse "Bad credentials" body with this
    // docs link instead of plain text — same root cause.
    expect(
      shouldReauthorizeGitHubApp(
        new Error("Bad credentials - https://docs.github.com/rest"),
      ),
    ).toBe(true)
  })

  it("returns true on refresh-token failure with invalid_grant marker", () => {
    expect(
      shouldReauthorizeGitHubApp(
        new Error(
          "GitHub App user token request failed: invalid_grant",
        ),
      ),
    ).toBe(true)
  })

  it("returns true on refresh-token failure with bad_refresh_token marker", () => {
    expect(
      shouldReauthorizeGitHubApp(
        new Error(
          "GitHub App user token request failed: bad_refresh_token",
        ),
      ),
    ).toBe(true)
  })

  it("returns false on transient 5xx errors (not a credential problem)", () => {
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({ status: 500, body: "Internal Server Error" }),
      ),
    ).toBe(false)
    expect(
      shouldReauthorizeGitHubApp(
        buildApiError({ status: 502, body: "Bad Gateway" }),
      ),
    ).toBe(false)
  })

  it("returns false on network errors / non-API errors", () => {
    expect(shouldReauthorizeGitHubApp(new Error("ECONNRESET"))).toBe(false)
    expect(shouldReauthorizeGitHubApp(new Error("Network timeout"))).toBe(
      false,
    )
  })

  it("returns false on null / undefined / non-error input", () => {
    expect(shouldReauthorizeGitHubApp(null)).toBe(false)
    expect(shouldReauthorizeGitHubApp(undefined)).toBe(false)
    expect(shouldReauthorizeGitHubApp("string error")).toBe(false)
  })

  it("does not return true for an unrelated 'failed' message that happens to mention 'refresh_token'", () => {
    // Guard: the OAuth-refresh branch requires the specific
    // "GitHub App user token request failed:" prefix.
    expect(
      shouldReauthorizeGitHubApp(new Error("server failed to load refresh_token")),
    ).toBe(false)
  })
})
