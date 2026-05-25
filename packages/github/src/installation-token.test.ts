import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Tests for the installation-token cache + in-flight dedup in app.ts.
 * Mocks the JWT signer + fetch so we can simulate concurrent callers and
 * assert that only one mint actually hits GitHub.
 */

vi.mock("jose", () => ({
  SignJWT: vi.fn().mockImplementation(() => ({
    setProtectedHeader: vi.fn().mockReturnThis(),
    setIssuer: vi.fn().mockReturnThis(),
    setIssuedAt: vi.fn().mockReturnThis(),
    setExpirationTime: vi.fn().mockReturnThis(),
    sign: vi.fn().mockResolvedValue("mock-jwt"),
  })),
  importPKCS8: vi.fn().mockResolvedValue("mock-key"),
}))

vi.mock("crypto", () => ({
  createPrivateKey: vi.fn().mockReturnValue({
    export: vi.fn().mockReturnValue("mock-pkcs8-key"),
  }),
}))

vi.mock("@tripwire/env/server", () => ({
  env: {
    GITHUB_APP_ID: "12345",
    GITHUB_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nmock\n-----END RSA PRIVATE KEY-----",
  },
}))

import {
  getInstallationToken,
  invalidateInstallationToken,
} from "./app"

let originalFetch: typeof global.fetch

beforeEach(() => {
  originalFetch = global.fetch
  // Bump installation ids per test so cache state doesn't leak.
})

afterEach(() => {
  global.fetch = originalFetch
})

function buildTokenResponse(token: string, expiresInMs = 60 * 60 * 1000) {
  return {
    ok: true,
    text: () =>
      Promise.resolve(
        JSON.stringify({
          token,
          expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        }),
      ),
    json: () =>
      Promise.resolve({
        token,
        expires_at: new Date(Date.now() + expiresInMs).toISOString(),
      }),
  } as unknown as Response
}

describe("getInstallationToken", () => {
  it("dedupes concurrent mints for the same installation — only one fetch fires", async () => {
    const installationId = 1001
    invalidateInstallationToken(installationId)

    let fetchCount = 0
    let resolveFetch: ((r: Response) => void) | undefined
    global.fetch = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          fetchCount++
          resolveFetch = resolve
        }),
    ) as typeof fetch

    // Fire three concurrent calls.
    const a = getInstallationToken(installationId)
    const b = getInstallationToken(installationId)
    const c = getInstallationToken(installationId)

    // The mint function does multiple awaits (jwt sign, then fetch) before
    // calling fetch — drain microtasks until fetch is actually invoked.
    await vi.waitFor(() => expect(fetchCount).toBe(1))

    resolveFetch?.(buildTokenResponse("ghs_token_xyz"))

    const [tokenA, tokenB, tokenC] = await Promise.all([a, b, c])
    expect(tokenA).toBe("ghs_token_xyz")
    expect(tokenB).toBe("ghs_token_xyz")
    expect(tokenC).toBe("ghs_token_xyz")
    expect(fetchCount).toBe(1)
  })

  it("serves the cached token on subsequent calls without re-fetching", async () => {
    const installationId = 1002
    invalidateInstallationToken(installationId)

    let fetchCount = 0
    global.fetch = vi.fn(() => {
      fetchCount++
      return Promise.resolve(buildTokenResponse("ghs_cached"))
    }) as typeof fetch

    const first = await getInstallationToken(installationId)
    const second = await getInstallationToken(installationId)
    expect(first).toBe("ghs_cached")
    expect(second).toBe("ghs_cached")
    expect(fetchCount).toBe(1)
  })

  it("mints a fresh token after invalidateInstallationToken clears the cache", async () => {
    const installationId = 1003
    invalidateInstallationToken(installationId)

    let fetchCount = 0
    global.fetch = vi.fn(() => {
      fetchCount++
      return Promise.resolve(buildTokenResponse(`ghs_v${fetchCount}`))
    }) as typeof fetch

    const first = await getInstallationToken(installationId)
    invalidateInstallationToken(installationId)
    const second = await getInstallationToken(installationId)

    expect(first).toBe("ghs_v1")
    expect(second).toBe("ghs_v2")
    expect(fetchCount).toBe(2)
  })

  it("cleans up the in-flight map even when the mint throws", async () => {
    const installationId = 1004
    invalidateInstallationToken(installationId)

    global.fetch = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve("oops"),
      } as unknown as Response),
    ) as typeof fetch

    await expect(getInstallationToken(installationId)).rejects.toBeDefined()

    // After the failed mint, the in-flight slot is empty so a follow-up
    // call gets its own mint instead of being stuck on the rejected promise.
    let secondFetchHappened = false
    global.fetch = vi.fn(() => {
      secondFetchHappened = true
      return Promise.resolve(buildTokenResponse("ghs_after_retry"))
    }) as typeof fetch

    const result = await getInstallationToken(installationId)
    expect(result).toBe("ghs_after_retry")
    expect(secondFetchHappened).toBe(true)
  })

  it("does not collide between different installation ids", async () => {
    invalidateInstallationToken(2001)
    invalidateInstallationToken(2002)

    let fetchCount = 0
    global.fetch = vi.fn((url: string | URL | Request) => {
      fetchCount++
      const u = String(url)
      const id = u.match(/installations\/(\d+)/)?.[1]
      return Promise.resolve(buildTokenResponse(`ghs_for_${id}`))
    }) as typeof fetch

    const [a, b] = await Promise.all([
      getInstallationToken(2001),
      getInstallationToken(2002),
    ])
    expect(a).toBe("ghs_for_2001")
    expect(b).toBe("ghs_for_2002")
    expect(fetchCount).toBe(2)
  })
})
