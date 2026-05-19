import { createFileRoute } from "@tanstack/react-router"
import { RulesMarketplacePanel } from "#/components/rules/panels/rules-marketplace-panel"

export const Route = createFileRoute("/_app/$orgHandle/rules/marketplace")({
  component: RulesMarketplacePanel,
})
