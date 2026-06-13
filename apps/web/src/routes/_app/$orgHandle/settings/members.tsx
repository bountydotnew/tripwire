import { createFileRoute } from "@tanstack/react-router"
import { OrgMembersPage } from "#/components/layout/settings/org/members-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/settings/members")({
  component: OrgMembersPage,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Members"),
      description: "Invite people, change roles, and revoke access.",
      robots: "noindex",
    }),
})
