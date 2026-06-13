import { createFileRoute } from "@tanstack/react-router"
import { VouchedUsersPage } from "#/components/layout/vouched/vouched-page"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/vouched")({
  // Public list of vouched contributors — prefetched so the initial
  // page paints from cache. Filters/pagination on the page itself
  // start fresh.
  loader: ({ context }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.vouches.list.queryOptions({ limit: 50, offset: 0 })
    )
  },
  component: VouchedUsersPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Vouched contributors"),
      description:
        "Contributors that Tripwire maintainers have personally vouched for. Safe to whitelist across your repos.",
    }),
})
