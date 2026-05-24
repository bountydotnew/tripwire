import { createFileRoute } from "@tanstack/react-router"
import { RulesRequestsPanel } from "#/components/layout/app/rules/panels/rules-extra-panels"

export const Route = createFileRoute("/_app/$orgHandle/rules/requests")({
  component: RulesRequestsPanel,
})
