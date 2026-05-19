import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/lib/use-org-redirect"

function RulesRedirect() {
  useOrgRedirect((slug) => `/${slug}/rules`)
  return null
}

export const Route = createFileRoute("/_app/rules")({
  component: RulesRedirect,
})
