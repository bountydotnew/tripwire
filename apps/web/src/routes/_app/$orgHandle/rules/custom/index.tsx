import { createFileRoute } from "@tanstack/react-router"
import {
  CustomRulesHubPage,
  CustomRulesHubPageSkeleton,
} from "#/components/layout/app/rules/custom/custom-rules-hub-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/")({
  component: CustomRulesHubPage,
  pendingComponent: CustomRulesHubPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Custom rules"),
      description:
        "Build repo-specific moderation flows with the visual rule editor. Create, simulate, then enable.",
      robots: "noindex",
    }),
})
