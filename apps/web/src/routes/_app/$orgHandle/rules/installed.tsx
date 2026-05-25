import { createFileRoute } from "@tanstack/react-router"
import { RulesInstalledPanel } from "#/components/layout/app/rules/panels/rules-installed-panel"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/installed")({
  component: RulesInstalledPanel,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Installed rules"),
      description:
        "Rules currently active in this repo — toggle, configure, or uninstall any of them.",
      robots: "noindex",
    }),
})
