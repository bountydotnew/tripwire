import { createFileRoute } from "@tanstack/react-router"
import {
  IntegrationsPage,
  IntegrationsPageSkeleton,
} from "#/components/layout/app/integrations/integrations-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/integrations")({
  component: IntegrationsPage,
  pendingComponent: IntegrationsPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Integrations"),
      description: "Connect repos via the Tripwire GitHub App.",
      robots: "noindex",
    }),
})
