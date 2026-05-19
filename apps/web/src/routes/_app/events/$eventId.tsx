import { createFileRoute } from "@tanstack/react-router"
import { useOrgRedirect } from "#/lib/use-org-redirect"

export const Route = createFileRoute("/_app/events/$eventId")({
  component: function EventRedirect() {
    const { eventId } = Route.useParams()
    useOrgRedirect((slug) => `/${slug}/events/${eventId}`)
    return null
  },
})
