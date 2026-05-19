import { createFileRoute } from "@tanstack/react-router"
import { RulesPeoplePanel } from "#/components/rules/panels/rules-extra-panels"

export const Route = createFileRoute("/_app/$orgHandle/rules/people")({
  component: RulesPeoplePanel,
})
