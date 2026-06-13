import { createFileRoute } from "@tanstack/react-router"
import { AdminOverviewPage } from "#/components/layout/admin/dashboard-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminOverviewPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Admin overview"),
      description: "Tripwire admin dashboard.",
      robots: "noindex",
    }),
})
