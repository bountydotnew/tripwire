import { createFileRoute, redirect } from "@tanstack/react-router"
import { OrgSettingsLayout } from "#/components/layout/settings/org/org-settings-layout"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/$orgHandle/settings")({
  beforeLoad: ({ location, params }) => {
    if (location.pathname === `/${params.orgHandle}/settings`) {
      throw redirect({
        to: "/$orgHandle/settings/general",
        params: { orgHandle: params.orgHandle },
      })
    }
  },
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Organization settings"),
      description: "Settings for your Tripwire workspace.",
      robots: "noindex",
    }),
  component: OrgSettingsLayout,
})
