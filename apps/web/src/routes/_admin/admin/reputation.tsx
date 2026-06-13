import { createFileRoute } from "@tanstack/react-router"
import { AdminReputationPage } from "#/components/layout/admin/reputation-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/reputation")({
  component: AdminReputationPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Admin: reputation"),
      description: "Edit contributor reputation scores.",
      robots: "noindex",
    }),
})
