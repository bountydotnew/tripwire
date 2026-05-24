import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/hooks/use-org-redirect"

function HomeRedirect() {
  useOrgRedirect((slug) => `/${slug}/home`)
  return null
}

export const Route = createFileRoute("/_app/home")({
  component: HomeRedirect,
})
