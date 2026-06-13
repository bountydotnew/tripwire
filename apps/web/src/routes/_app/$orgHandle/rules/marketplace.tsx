import { createFileRoute } from "@tanstack/react-router"
import { RulesMarketplacePanel } from "#/components/layout/app/rules/panels/rules-marketplace-panel"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/marketplace")({
  component: RulesMarketplacePanel,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Rule marketplace"),
      description: "Install rules from the Tripwire team or the community.",
      robots: "noindex",
    }),
})
