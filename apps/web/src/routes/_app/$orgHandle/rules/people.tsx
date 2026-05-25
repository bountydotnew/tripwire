import { createFileRoute } from "@tanstack/react-router"
import { RulesPeoplePanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/people")({
  component: RulesPeoplePanel,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("People"),
      description:
        "Whitelisted contributors who skip every rule, plus blacklisted users who get blocked on sight.",
      robots: "noindex",
    }),
})
