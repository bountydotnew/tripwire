import { createFileRoute } from "@tanstack/react-router"
import { TemplatePreviewPage } from "#/components/layout/app/automations/automation-preview-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/automations/preview")({
  validateSearch: (search: Record<string, unknown>) => ({
    template: (search.template as string) ?? "",
  }),
  component: TemplatePreviewPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Automation preview"),
      description: "Preview an automation template before saving it.",
      robots: "noindex",
    }),
})
