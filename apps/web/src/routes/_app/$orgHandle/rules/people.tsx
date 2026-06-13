import { createFileRoute } from "@tanstack/react-router"
import { RulesPeoplePanel } from "#/components/layout/app/rules/panels/rules-extra-panels"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/rules/people")({
  component: RulesPeoplePanel,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("People"),
      description:
        "Whitelisted contributors who skip every rule, plus blacklisted users who get blocked on sight.",
      robots: "noindex",
    }),
})
