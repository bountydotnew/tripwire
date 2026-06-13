import { createFileRoute } from "@tanstack/react-router"
import {
  UserProfilePage,
  UserProfilePageSkeleton,
} from "#/components/layout/app/profile/user-profile-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_app/users/$username")({
  component: UserProfilePage,
  pendingComponent: UserProfilePageSkeleton,
  head: ({ params, match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle(`@${params.username}`),
      description: `@${params.username}'s profile on Tripwire.`,
      type: "profile",
    }),
})
