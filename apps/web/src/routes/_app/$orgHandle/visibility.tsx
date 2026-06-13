import { createFileRoute } from "@tanstack/react-router"
import {
  VisibilityPage,
  VisibilityPageSkeleton,
} from "#/components/layout/app/visibility/visibility-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/visibility")({
  component: VisibilityPage,
  pendingComponent: VisibilityPageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Visibility"),
      description:
        "Every contributor in your repos, their reputation scores, and a whitelist for people you already trust.",
      robots: "noindex",
    }),
})
