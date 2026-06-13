import { createFileRoute } from "@tanstack/react-router"
import { NewResearchRunPage } from "#/components/layout/admin/research/new-run-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/research/new")({
  component: NewResearchRunPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("New research run"),
      description: "Kick off a new contributor research run.",
      robots: "noindex",
    }),
})
