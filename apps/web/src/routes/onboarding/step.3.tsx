import { createFileRoute } from "@tanstack/react-router"
import { OnboardingStep3Page } from "#/components/layout/onboarding/step-3-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/onboarding/step/3")({
  component: OnboardingStep3Page,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Pick your rules"),
      description: "Choose the moderation rules you want Tripwire to enforce.",
      robots: "noindex",
    }),
})
