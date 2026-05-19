import { createFileRoute } from "@tanstack/react-router"
import { RulesWorkflowsPanel } from "#/components/rules/panels/rules-extra-panels"

export const Route = createFileRoute("/_app/$orgHandle/rules/workflows")({
  component: RulesWorkflowsPanel,
})
