import { createFileRoute } from "@tanstack/react-router"
import {
  AutomationEditorPage,
  AutomationEditorPageSkeleton,
} from "#/components/layout/app/automations/automation-editor-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute(
  "/_app/$orgHandle/automations/$automationId"
)({
  // Prefetch the workflow detail so the editor renders against a warm
  // cache. Skipped when this nav came from the list and the cache is
  // already populated.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.workflows.get.queryOptions({ id: params.automationId })
    )
  },
  component: AutomationEditorPage,
  pendingComponent: AutomationEditorPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Automation editor"),
      description:
        "Build and edit Tripwire automations. Trigger → action chains that fire on every webhook.",
      robots: "noindex",
    }),
})
