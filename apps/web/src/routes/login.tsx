import { createFileRoute } from "@tanstack/react-router"
import {
  LoginPage,
  LoginPageSkeleton,
} from "#/components/layout/auth/login-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/login")({
  component: LoginPage,
  pendingComponent: LoginPageSkeleton,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Log in"),
      description: "Log in to your Tripwire account.",
    }),
})
