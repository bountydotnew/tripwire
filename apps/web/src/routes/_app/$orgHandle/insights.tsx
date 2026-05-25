import { createFileRoute } from "@tanstack/react-router"
import {
  InsightsPage,
  InsightsPageSkeleton,
} from "#/components/layout/app/insights/insights-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/insights")({
  component: InsightsPage,
  pendingComponent: InsightsPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Insights"),
      description:
        "Tripwire's effectiveness at a glance — total spam blocked, bot blacklist trends, and PR/issue protection over time.",
      robots: "noindex",
    }),
})
