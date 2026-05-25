import { createFileRoute } from "@tanstack/react-router"
import {
  EventsPage,
  EventsPageSkeleton,
} from "#/components/layout/app/events/events-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/events/")({
  component: EventsPage,
  pendingComponent: EventsPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Events"),
      description:
        "Real-time activity feed for your repos — every webhook, every rule eval, every contributor action.",
      robots: "noindex",
    }),
})
