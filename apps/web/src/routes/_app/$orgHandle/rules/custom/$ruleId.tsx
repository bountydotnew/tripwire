import { createFileRoute } from "@tanstack/react-router"
import {
  RuleBuilderPage,
  RuleBuilderPageSkeleton,
} from "#/components/layout/app/rules/custom/rule-builder-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/$ruleId")({
  component: RuleBuilderPage,
  pendingComponent: RuleBuilderPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match, params }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle(
        params.ruleId === "new" ? "New custom rule" : "Edit custom rule"
      ),
      description: "Edit a repo-specific moderation rule in the visual editor.",
      robots: "noindex",
    }),
})
