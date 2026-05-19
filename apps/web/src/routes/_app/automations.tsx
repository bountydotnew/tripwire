import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/lib/use-org-redirect"

function AutomationsRedirect() {
  useOrgRedirect((slug) => `/${slug}/automations`)
  return null
}

export const Route = createFileRoute("/_app/automations")({
  component: AutomationsRedirect,
})
