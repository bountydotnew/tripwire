import { createFileRoute } from "@tanstack/react-router"
import { RulesWorkflowsPanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/workflows")({
  component: RulesWorkflowsPanel,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Workflows"),
      description:
        "Workflows that respond to events. Auto-close PRs, kick off reviews, run scheduled checks.",
      robots: "noindex",
    }),
})
