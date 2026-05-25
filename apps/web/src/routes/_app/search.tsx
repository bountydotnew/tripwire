import { createFileRoute } from "@tanstack/react-router"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

function SearchPage() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center">
        <h2 className="mb-2 text-xl font-medium text-white">Search</h2>
        <p className="text-sm text-tw-text-secondary">Coming soon</p>
      </div>
    </div>
  )
}

export const Route = createFileRoute("/_app/search")({
  component: SearchPage,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Search"),
      description: "Search across your Tripwire workspace.",
      robots: "noindex",
    }),
})
