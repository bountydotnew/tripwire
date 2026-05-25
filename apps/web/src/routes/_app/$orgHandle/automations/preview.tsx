import { createFileRoute } from "@tanstack/react-router"
import { TemplatePreviewPage } from "#/components/layout/app/automations/automation-preview-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/automations/preview")({
  validateSearch: (search: Record<string, unknown>) => ({
    template: (search.template as string) ?? "",
  }),
  component: TemplatePreviewPage,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Automation preview"),
      description:
        "Preview a Tripwire automation template before saving it to your workspace.",
      robots: "noindex",
    }),
})
