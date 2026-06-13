import { createFileRoute } from "@tanstack/react-router"
import {
  AutomationsPage,
  AutomationsPageSkeleton,
} from "#/components/layout/app/automations/automations-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/automations/")({
  component: AutomationsPage,
  pendingComponent: AutomationsPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Automations"),
      description:
        "Visual workflows that pipe contributors through rules and actions.",
      robots: "noindex",
    }),
})
