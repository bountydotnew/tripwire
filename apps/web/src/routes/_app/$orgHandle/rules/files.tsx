import { createFileRoute } from "@tanstack/react-router"
import { RulesFilesPanel } from "#/components/rules/panels/rules-extra-panels"

export const Route = createFileRoute("/_app/$orgHandle/rules/files")({
  component: RulesFilesPanel,
})
