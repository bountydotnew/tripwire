import { createFileRoute } from "@tanstack/react-router"
import { Step2Page } from "#/components/layout/onboarding/step2-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/onboarding/step/2")({
  // Prefetch the repo list — page renders against a warm cache on arrival.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.orgs.myRepos.queryOptions(),
    )
  },
  component: Step2Page,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Pick your main repo"),
      description:
        "Choose your primary GitHub repository to start protecting with Tripwire.",
      robots: "noindex",
    }),
})
