import { createFileRoute } from "@tanstack/react-router"
import { RulesInstalledPanel } from "#/components/layout/app/rules/panels/rules-installed-panel"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/installed")({
  component: RulesInstalledPanel,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Installed rules"),
      description:
        "Rules currently active in this repo. Toggle, configure, or uninstall.",
      robots: "noindex",
    }),
})
