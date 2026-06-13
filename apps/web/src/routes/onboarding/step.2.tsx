import { createFileRoute } from "@tanstack/react-router"
import { Step2Page } from "#/components/layout/onboarding/step2-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/onboarding/step/2")({
  // Prefetch the repo list — page renders against a warm cache on arrival.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.orgs.myRepos.queryOptions()
    )
  },
  component: Step2Page,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Pick your main repo"),
      description: "Pick the GitHub repo you want Tripwire to protect first.",
      robots: "noindex",
    }),
})
