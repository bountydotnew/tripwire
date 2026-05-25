import { createFileRoute } from "@tanstack/react-router"
import {
  VisibilityPage,
  VisibilityPageSkeleton,
} from "#/components/layout/app/visibility/visibility-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/visibility")({
  component: VisibilityPage,
  pendingComponent: VisibilityPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Visibility"),
      description:
        "Contributors, reputation scores, and whitelist controls for your repos. Spot risky activity at a glance and pre-approve the people you trust.",
      robots: "noindex",
    }),
})
