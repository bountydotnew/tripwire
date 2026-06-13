import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useEffect } from "react"
import { authClient } from "@tripwire/auth/client"

export const Route = createFileRoute("/_app/$orgHandle")({
  component: OrgGate,
})

/**
 * Validates that the `$orgHandle` in the URL belongs to an org the
 * signed-in user is a member of. Non-members get redirected to their
 * first org's home (or `/` if they don't have any orgs yet — e.g. a
 * brief window during onboarding).
 *
 * This is the *only* place that enforces URL→membership consistency.
 * The workspace context's reconciliation effect would silently flip
 * `session.activeOrganizationId` to a fallback otherwise, leaving the
 * URL pointing at the wrong org's data — exactly the bug we're fixing.
 */
function OrgGate() {
  const { orgHandle } = Route.useParams()
  const navigate = useNavigate()
  const { data: orgs, isPending } = authClient.useListOrganizations()

  useEffect(() => {
    if (isPending) return
    if (!orgs) return
    const isMember = orgs.some((o) => o.slug === orgHandle)
    if (isMember) return

    // Not a member of the requested org. Bounce to first org's home,
    // or to the landing/onboarding flow if they have none.
    const fallbackSlug = orgs[0]?.slug
    if (fallbackSlug) {
      navigate({
        to: "/$orgHandle/home",
        params: { orgHandle: fallbackSlug },
        replace: true,
      })
    } else {
      navigate({ to: "/onboarding", replace: true })
    }
  }, [isPending, orgs, orgHandle, navigate])

  return <Outlet />
}
