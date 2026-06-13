import { createFileRoute } from "@tanstack/react-router"
import { ConsentPage } from "#/components/layout/oauth/consent-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/oauth/consent")({
  component: ConsentPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Authorize app"),
      description: "Authorize an app to access your Tripwire account.",
      robots: "noindex",
    }),
})
