import { useEffect } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"

export function useOnboardingRedirect() {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const trpc = useTRPC()
  const stateQuery = useQuery(
    trpc.onboarding.getState.queryOptions(undefined, { staleTime: 60_000 })
  )

  useEffect(() => {
    if (stateQuery.isLoading) return
    if (pathname.startsWith("/onboarding")) return
    if (pathname.startsWith("/settings")) return
    if (pathname.startsWith("/login")) return
    if (pathname.startsWith("/api")) return
    // Also exempt org-scoped settings (`/{orgHandle}/settings`) so users
    // visiting org settings aren't bounced into the onboarding wizard.
    if (/^\/[^/]+\/settings(\/|$)/.test(pathname)) return
    if (stateQuery.data === null) {
      navigate({ to: "/onboarding/step/1" })
      return
    }
    if (stateQuery.data && !stateQuery.data.completedStep4) {
      const step = stateQuery.data.completedStep3
        ? 4
        : stateQuery.data.completedStep2
          ? 3
          : stateQuery.data.completedStep1
            ? 2
            : 1
      const path = `/onboarding/step/${step}` as const
      if (path === "/onboarding/step/1") {
        navigate({ to: "/onboarding/step/1" })
      } else if (path === "/onboarding/step/2") {
        navigate({ to: "/onboarding/step/2" })
      } else if (path === "/onboarding/step/3") {
        navigate({ to: "/onboarding/step/3" })
      } else {
        navigate({ to: "/onboarding/step/4" })
      }
    }
  }, [pathname, stateQuery.isLoading, stateQuery.data, navigate])
}
