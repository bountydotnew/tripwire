import { createFileRoute } from "@tanstack/react-router"
import { OrgGeneralSettingsPage } from "#/components/layout/settings/org/general-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/settings/general")({
  component: OrgGeneralSettingsPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("General settings"),
      description: "App preferences and GitHub install configuration.",
      robots: "noindex",
    }),
})
