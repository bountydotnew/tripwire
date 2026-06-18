import { createFileRoute } from "@tanstack/react-router"
import { OrgPrCommentsSettingsPage } from "#/components/layout/settings/org/pr-comments-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/settings/pr-comments")({
  component: OrgPrCommentsSettingsPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("PR Comment preferences"),
      description: "Customize how Tripwire appears on your PRs and issues.",
      robots: "noindex",
    }),
})
