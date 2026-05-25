import { createFileRoute } from "@tanstack/react-router"
import { RulesMarketplacePanel } from "#/components/layout/app/rules/panels/rules-marketplace-panel"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/marketplace")({
  component: RulesMarketplacePanel,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Rule marketplace"),
      description:
        "Browse and install moderation rules built by the Tripwire team and the open-source community.",
      robots: "noindex",
    }),
})
