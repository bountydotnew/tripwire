import { createFileRoute } from "@tanstack/react-router"
import { createContext } from "#/integrations/trpc/init"
import { INSTALL_STATE_COOKIE, signInstallState } from "@tripwire/github"
import { env } from "@tripwire/env/client"

/**
 * Initiates a GitHub App install with a signed `state` parameter.
 *
 * Flow:
 *   1. User clicks "Install" on /integrations.
 *   2. Browser hits /api/github/install.
 *   3. We mint a signed state bound to the session user.
 *   4. We set `__tripwire_install_state` cookie (HttpOnly, SameSite=Lax).
 *   5. We 302 to https://github.com/apps/<slug>/installations/new?state=<value>.
 *   6. GitHub redirects back to /api/github/callback with that same state.
 *   7. The callback verifies cookie === query state AND signature.
 */
async function handler({ request }: { request: Request }) {
  const ctx = await createContext({ headers: request.headers })
  if (!ctx.user) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/login?next=/integrations" },
    })
  }

  const appSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-dev"
  const { value, cookieMaxAge } = signInstallState(ctx.user.id)
  const isProd = process.env.NODE_ENV === "production"

  const cookieAttrs = [
    `${INSTALL_STATE_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${cookieMaxAge}`,
  ]
  if (isProd) cookieAttrs.push("Secure")

  const installUrl = new URL(
    `https://github.com/apps/${appSlug}/installations/new`
  )
  installUrl.searchParams.set("state", value)

  const headers = new Headers({
    Location: installUrl.toString(),
    "Set-Cookie": cookieAttrs.join("; "),
    "Cache-Control": "no-store",
  })

  return new Response(null, { status: 302, headers })
}

export const Route = createFileRoute("/api/github/install")({
  server: {
    handlers: {
      GET: handler,
    },
  },
})
