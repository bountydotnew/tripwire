import { createFileRoute } from "@tanstack/react-router"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

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
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Search"),
      description: "Find chats, events, and contributors fast.",
      robots: "noindex",
    }),
})
