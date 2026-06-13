import { createFileRoute } from "@tanstack/react-router"
import { ResearchRunsPage } from "#/components/layout/admin/research/runs-list-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/research/")({
  // Prefetch the research-runs list so the page paints from cache.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.research.list.queryOptions({ limit: 50 })
    )
  },
  component: ResearchRunsPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Admin: research"),
      description: "Research runs. Batch contributor analysis with CSV/JSONL exports.",
      robots: "noindex",
    }),
})
