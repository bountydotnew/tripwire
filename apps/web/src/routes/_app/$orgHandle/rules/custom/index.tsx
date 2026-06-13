import { createFileRoute } from "@tanstack/react-router"
import {
  CustomRulesHubPage,
  CustomRulesHubPageSkeleton,
} from "#/components/layout/app/rules/custom/custom-rules-hub-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/")({
  component: CustomRulesHubPage,
  pendingComponent: CustomRulesHubPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Custom rules"),
      description:
        "Build repo-specific moderation flows in the visual editor. Create, simulate, enable.",
      robots: "noindex",
    }),
})
