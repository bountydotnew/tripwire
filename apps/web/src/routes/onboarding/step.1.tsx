import { createFileRoute } from "@tanstack/react-router"
import { Step1Page } from "#/components/layout/onboarding/step1-page"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/onboarding/step/1")({
  component: Step1Page,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Welcome"),
      description:
        "Set up Tripwire to protect your repos from bot PRs, spam issues, and takeover attempts.",
      robots: "noindex",
    }),
})
