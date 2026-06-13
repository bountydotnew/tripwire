import { createFileRoute } from "@tanstack/react-router"
import { ChatRoute } from "#/components/layout/app/chat/chat-page"
import { buildSeo, formatPageTitle, privateHeaders } from "#/lib/seo"

export const Route = createFileRoute("/_app/chat/$chatId")({
  // Prefetch the chat's conversation thread so the page renders against
  // a warm cache when the user navigates in from anywhere.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.chats.get.queryOptions({ chatId: params.chatId })
    )
  },
  component: ChatRoute,
  headers: () => privateHeaders,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Chat"),
      description:
        "Ask Tripwire about contributors, rules, and what's hitting your repos.",
      robots: "noindex",
    }),
})
