import { createFileRoute } from "@tanstack/react-router"
import {
  IntegrationsPage,
  IntegrationsPageSkeleton,
} from "#/components/layout/app/integrations/integrations-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/integrations")({
  component: IntegrationsPage,
  pendingComponent: IntegrationsPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Integrations"),
      description:
        "Connect repositories and manage your Tripwire GitHub App integration.",
      robots: "noindex",
    }),
})
