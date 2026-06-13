import { createFileRoute } from "@tanstack/react-router"
import { RequestPage } from "#/components/layout/request/request-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/request/$owner/$repo")({
  component: RequestPage,
  head: ({ match, params }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle(
        `Request access to ${params.owner}/${params.repo}`
      ),
      description: `Ask the maintainers of ${params.owner}/${params.repo} to unblock you.`,
      robots: "noindex",
    }),
})
