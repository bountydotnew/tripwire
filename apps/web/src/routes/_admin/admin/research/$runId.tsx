import { createFileRoute } from "@tanstack/react-router"
import { ResearchRunDetailPage } from "#/components/layout/admin/research/run-detail-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/research/$runId")({
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.research.status.queryOptions({ runId: params.runId })
    )
  },
  component: ResearchRunDetailPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Research run"),
      description: "Stats and exports for one research run.",
      robots: "noindex",
    }),
})
