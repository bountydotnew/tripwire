import { createFileRoute } from "@tanstack/react-router"
import {
  RuleBuilderPage,
  RuleBuilderPageSkeleton,
} from "#/components/layout/app/rules/custom/rule-builder-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/$ruleId")({
  component: RuleBuilderPage,
  pendingComponent: RuleBuilderPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match, params }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle(
        params.ruleId === "new" ? "New custom rule" : "Edit custom rule",
      ),
      description:
        "Build or edit a repo-specific moderation rule with the visual editor.",
      robots: "noindex",
    }),
})
