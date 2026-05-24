import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/hooks/use-org-redirect"

function EventsRedirect() {
  useOrgRedirect((slug) => `/${slug}/events`)
  return null
}

export const Route = createFileRoute("/_app/events/")({
  component: EventsRedirect,
})
