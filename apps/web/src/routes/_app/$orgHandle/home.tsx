import { createFileRoute } from "@tanstack/react-router"
import {
  HomePage,
  HomePageSkeleton,
} from "#/components/layout/app/home/home-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/home")({
  component: HomePage,
  pendingComponent: HomePageSkeleton,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Home"),
      description:
        "Your tripwire dashboard — the last 48 hours of moderation activity, setup checklist, and one-shot chat composer.",
      robots: "noindex",
    }),
})
