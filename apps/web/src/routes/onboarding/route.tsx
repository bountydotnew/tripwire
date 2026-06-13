import { createFileRoute } from "@tanstack/react-router"
import { OnboardingLayout } from "#/components/layout/onboarding/onboarding-layout"
import { privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingLayout,
  headers: () => privateHeaders,
})
