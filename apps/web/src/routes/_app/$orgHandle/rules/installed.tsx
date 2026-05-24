import { createFileRoute } from "@tanstack/react-router"
import { RulesInstalledPanel } from "#/components/layout/app/rules/panels/rules-installed-panel"

export const Route = createFileRoute("/_app/$orgHandle/rules/installed")({
  component: RulesInstalledPanel,
})
