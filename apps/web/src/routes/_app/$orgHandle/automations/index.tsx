import { createFileRoute } from "@tanstack/react-router"
import {
  AutomationsPage,
  AutomationsPageSkeleton,
} from "#/components/layout/app/automations/automations-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/automations/")({
  component: AutomationsPage,
  pendingComponent: AutomationsPageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Automations"),
      description:
        "Visual workflows that process contributors through rule chains, logic gates, and actions.",
      robots: "noindex",
    }),
})
