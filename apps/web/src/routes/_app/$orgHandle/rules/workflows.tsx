import { createFileRoute } from "@tanstack/react-router"
import { RulesWorkflowsPanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/workflows")({
  component: RulesWorkflowsPanel,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Workflows"),
      description:
        "Automations that respond to events — auto-close PRs, trigger reviews, run checks on a schedule.",
      robots: "noindex",
    }),
})
