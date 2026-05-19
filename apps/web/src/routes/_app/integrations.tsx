import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/lib/use-org-redirect"

function IntegrationsRedirect() {
  useOrgRedirect((slug) => `/${slug}/integrations`)
  return null
}

export const Route = createFileRoute("/_app/integrations")({
  component: IntegrationsRedirect,
})
