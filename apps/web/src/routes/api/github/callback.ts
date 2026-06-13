import { createFileRoute } from "@tanstack/react-router"
import { createLogger } from "@tripwire/logger"
import { createContext } from "#/integrations/trpc/init"
import { INSTALL_STATE_COOKIE, verifyInstallState } from "@tripwire/github"
import { ensureInstallation } from "#/lib/github/install"

const logger = createLogger("Callback")

type CallbackError =
  | "invalid_state"
  | "installer_mismatch"
  | "not_authenticated"

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url)
  const installationId = url.searchParams.get("installation_id")
  const setupAction = url.searchParams.get("setup_action")
  const queryState = url.searchParams.get("state")

  const ctx = await createContext({ headers: request.headers })

  if (installationId && setupAction === "install") {
    if (!ctx.user) return redirectToIntegrations("not_authenticated")

    const cookieState = readCookie(
      request.headers.get("cookie"),
      INSTALL_STATE_COOKIE
    )
    if (!queryState || !cookieState || queryState !== cookieState) {
      return redirectToIntegrations("invalid_state")
    }
    if (!verifyInstallState(queryState, ctx.user.id)) {
      return redirectToIntegrations("invalid_state")
    }

    try {
      const result = await ensureInstallation(
        Number(installationId),
        ctx.user.id
      )
      if (result === "installer_mismatch") {
        return redirectToIntegrations("installer_mismatch")
      }
    } catch (err) {
      logger.error("Failed to ensure installation", err)
    }

    return new Response(null, {
      status: 302,
      headers: new Headers([
        ["Location", "/integrations"],
        ["Set-Cookie", clearStateCookie()],
      ]),
    })
  }

  return new Response(null, {
    status: 302,
    headers: { Location: "/home" },
  })
}

function redirectToIntegrations(error: CallbackError) {
  return new Response(null, {
    status: 302,
    headers: new Headers([
      ["Location", `/integrations?error=${encodeURIComponent(error)}`],
      ["Set-Cookie", clearStateCookie()],
    ]),
  })
}

function clearStateCookie(): string {
  const isProd = process.env.NODE_ENV === "production"
  const parts = [
    `${INSTALL_STATE_COOKIE}=`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0",
  ]
  if (isProd) parts.push("Secure")
  return parts.join("; ")
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(";")) {
    const eq = part.indexOf("=")
    if (eq === -1) continue
    if (part.slice(0, eq).trim() === name) return part.slice(eq + 1).trim()
  }
  return null
}

export const Route = createFileRoute("/api/github/callback")({
  server: {
    handlers: { GET: handler },
  },
})
