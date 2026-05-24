import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/hooks/use-org-redirect"

function InsightsRedirect() {
  useOrgRedirect((slug) => `/${slug}/insights`)
  return null
}

export const Route = createFileRoute("/_app/insights")({
  component: InsightsRedirect,
})
