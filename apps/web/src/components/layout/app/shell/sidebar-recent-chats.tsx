import { useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@tripwire/ui/tooltip"
import {
  ChatBubbleOutlineIcon12,
  StrokeXIcon10Muted,
} from "@tripwire/ui/icons/app-chrome-icons"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"
import { useAIChat } from "#/providers/chat-context"
import { useWorkspace } from "#/providers/workspace-context"

export function SidebarRecentChats() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { loadChat, conversationId, open } = useAIChat()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { repo } = useWorkspace()
  const { data: session } = authClient.useSession()
  const currentUserId = session?.user?.id
  const chatsQuery = useQuery(
    trpc.chats.list.queryOptions({ limit: 3, repoId: repo?.id })
  )
  const chats = chatsQuery.data ?? []

  const listQueryKey = trpc.chats.list.queryKey({ limit: 3, repoId: repo?.id })
  const deleteChat = useMutation(
    trpc.chats.delete.mutationOptions({
      onMutate: async ({ chatId }) => {
        setConfirmDeleteId(null)
        await queryClient.cancelQueries({ queryKey: listQueryKey })
        const previous = queryClient.getQueryData(listQueryKey)
        queryClient.setQueryData(
          listQueryKey,
          (old: typeof chats | undefined) =>
            old ? old.filter((c) => c.id !== chatId) : []
        )
        return { previous }
      },
      onError: (_err, _vars, ctx) => {
        if (ctx?.previous) {
          queryClient.setQueryData(listQueryKey, ctx.previous)
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: listQueryKey })
      },
    })
  )

  if (chats.length === 0) return null

  return (
    <div className="relative shrink-0 px-3 py-1">
      <div className="mb-0.5">
        <span className="text-[11px] font-medium tracking-wider text-tw-text-muted uppercase">
          Recent
        </span>
      </div>
      <AnimatePresence initial={false}>
        {chats.map((chat) => {
          const isActive = chat.id === conversationId
          const isConfirming = confirmDeleteId === chat.id

          if (isConfirming) {
            return (
              <motion.div
                key={chat.id}
                layout
                transition={{
                  layout: { duration: 0.25, ease: [0.25, 1, 0.5, 1] },
                }}
                className="flex items-center gap-2 py-1"
              >
                <span className="flex-1 truncate text-[12px] text-tw-text-secondary">
                  Delete?
                </span>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => deleteChat.mutate({ chatId: chat.id })}
                  className="px-0 text-[11px] font-medium text-red-400"
                >
                  Yes
                </Button>
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => setConfirmDeleteId(null)}
                  className="px-0 text-[11px] font-medium text-tw-text-muted"
                >
                  No
                </Button>
              </motion.div>
            )
          }

          return (
            <motion.div
              key={chat.id}
              layout
              exit={{ opacity: 0, height: 0, overflow: "hidden" }}
              transition={{
                layout: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
                duration: 0.15,
              }}
              className="group flex items-center gap-1.5 py-2"
            >
              {/* biome-ignore lint/correctness/noRestrictedElements: needed here because ui breaks without... todo: fix???? */}
              <button
                type="button"
                onClick={() => {
                  if (isActive) return
                  queryClient.prefetchQuery(
                    trpc.chats.get.queryOptions({ chatId: chat.id })
                  )
                  loadChat(chat.id)
                  open()
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5"
              >
                {currentUserId && chat.authorId !== currentUserId ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        chat.authorImage ? (
                          <img
                            src={chat.authorImage}
                            alt={chat.authorName ?? "Member"}
                            className="size-4 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-tw-inner text-[8px] font-medium text-tw-text-secondary">
                            {(chat.authorName ?? "?").charAt(0).toUpperCase()}
                          </span>
                        )
                      }
                    />
                    <TooltipContent side="right">
                      {chat.authorName ?? "Workspace member"}
                    </TooltipContent>
                  </Tooltip>
                ) : (
                  <ChatBubbleOutlineIcon12
                    className={`shrink-0 ${isActive ? "text-tw-text-primary" : "text-tw-text-muted"}`}
                  />
                )}
                <span
                  className={`truncate text-[12px] ${isActive ? "text-tw-text-primary" : "text-tw-text-muted"}`}
                >
                  {chat.title ?? "New chat"}
                </span>
              </button>
              {/* biome-ignore lint/correctness/noRestrictedElements: needed here because ui breaks without... todo: fix???? */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmDeleteId(chat.id)
                }}
                className="shrink-0 opacity-0 group-hover:opacity-100"
              >
                <StrokeXIcon10Muted />
              </button>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
