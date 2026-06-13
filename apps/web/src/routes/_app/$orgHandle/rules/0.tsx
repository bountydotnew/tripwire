import { createFileRoute } from "@tanstack/react-router"
import { RulesRequestsPanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/0")({
  component: RulesRequestsPanel,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Requests"),
      description:
        "Contributors who hit a rule and asked for an exception. Approve, deny, or reply with a one-liner.",
      robots: "noindex",
    }),
})
