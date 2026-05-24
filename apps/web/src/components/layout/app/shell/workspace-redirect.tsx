import { useEffect } from "react"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { useWorkspace } from "#/providers/workspace-context"

/**
 * Auto-redirects users to their default org when they land on a path
 * that needs org context but doesn't have an org handle in the URL.
 */
export function WorkspaceRedirect() {
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname
  const { orgs, isLoading } = useWorkspace()

  useEffect(() => {
    if (isLoading || orgs.length === 0) return

    // Only redirect on the bare /_app root (no specific page)
    // The legacy redirect stubs handle /home, /rules, etc.
    // This handles the case where someone navigates to just "/"
    // after login and needs to land on their default org's home.
    if (pathname === "/" || pathname === "") {
      // Don't redirect on the landing page — it's a public route
      return
    }
  }, [isLoading, orgs, pathname, navigate])

  return null
}
