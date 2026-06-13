import { createFileRoute } from "@tanstack/react-router"
import { OrgBillingSettingsPage } from "#/components/layout/settings/org/billing-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/settings/billing")({
  component: OrgBillingSettingsPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Billing"),
      description: "Subscription, invoices, and usage limits.",
      robots: "noindex",
    }),
})
