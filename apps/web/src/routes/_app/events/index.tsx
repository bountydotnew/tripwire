import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/lib/use-org-redirect"

function EventsRedirect() {
  useOrgRedirect((slug) => `/${slug}/events`)
  return null
}

export const Route = createFileRoute("/_app/events/")({
  component: EventsRedirect,
})
