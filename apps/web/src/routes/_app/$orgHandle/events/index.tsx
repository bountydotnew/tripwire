import { createFileRoute } from "@tanstack/react-router"
import {
  EventsPage,
  EventsPageSkeleton,
} from "#/components/layout/app/events/events-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/events/")({
  component: EventsPage,
  pendingComponent: EventsPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Events"),
      description:
        "Live activity feed. Every webhook, every rule eval, every contributor action.",
      robots: "noindex",
    }),
})
