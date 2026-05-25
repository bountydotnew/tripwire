import { createFileRoute } from "@tanstack/react-router"
import { RulesFilesPanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/files")({
  component: RulesFilesPanel,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Repo files"),
      description:
        "RULES.md, AGENTS.md, and other repo files Tripwire uses to drive rule evaluation.",
      robots: "noindex",
    }),
})
