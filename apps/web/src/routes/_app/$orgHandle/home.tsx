import { createFileRoute } from "@tanstack/react-router"
import {
  HomePage,
  HomePageSkeleton,
} from "#/components/layout/app/home/home-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/home")({
  component: HomePage,
  pendingComponent: HomePageSkeleton,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Home"),
      description:
        "The last 48 hours of moderation activity, your setup checklist, and the Tripwire chat.",
      robots: "noindex",
    }),
})
