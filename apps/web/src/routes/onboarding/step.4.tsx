import { createFileRoute } from "@tanstack/react-router"
import { OnboardingStep4Page } from "#/components/layout/onboarding/step-4-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/onboarding/step/4")({
  component: OnboardingStep4Page,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Backfilling history"),
      description:
        "Backfilling PR and issue history so Visibility has data the moment you get there.",
      robots: "noindex",
    }),
})
