import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/hooks/use-org-redirect"

function VisibilityRedirect() {
  useOrgRedirect((slug) => `/${slug}/visibility`)
  return null
}

export const Route = createFileRoute("/_app/visibility")({
  component: VisibilityRedirect,
})
