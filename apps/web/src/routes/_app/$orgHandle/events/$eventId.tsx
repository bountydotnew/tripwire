import { createFileRoute } from "@tanstack/react-router"
import {
  EventDetailPage,
  EventDetailPageSkeleton,
} from "#/components/layout/app/events/event-detail-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/events/$eventId")({
  // Prefetch the event detail so the page paints against a warm cache.
  // Chained navigations from the events list will hit this same query
  // and re-use the entry that page already populated.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.events.get.queryOptions({ eventId: params.eventId })
    )
  },
  component: EventDetailPage,
  pendingComponent: EventDetailPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Event"),
      description:
        "Audit trail for one event. The contributor, the rules that fired, and what the pipeline did.",
      robots: "noindex",
    }),
})
