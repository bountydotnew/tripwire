import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "#/components/ui/button"
import { useQuery } from "@tanstack/react-query"
import { useState, useRef, useEffect } from "react"
import { ChatComposer } from "#/components/chat/chat-composer"
import { ChatThread } from "#/components/chat/chat-thread"
import { usePersistedChat } from "#/components/chat/use-persisted-chat"
import { useWorkspace } from "#/lib/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import type { UIMessage } from "#/types/chat"
import { ChevronLeftStrokeIcon14 } from "#/components/icons/app-chrome-icons"

export const Route = createFileRoute("/_app/chat/$chatId")({
  component: ChatPage,
})

function ChatPage() {
  const { chatId } = Route.useParams()
  const navigate = useNavigate()
  const { repo } = useWorkspace()
  const trpc = useTRPC()

  // Load conversation from DB
  const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId }))

  // Only use initialMessage from sessionStorage (cleared after use, survives navigation but not refresh)
  const [initialMessage] = useState(() => {
    const key = `tw.chat.init.${chatId}`
    if (typeof window === "undefined") return null
    const msg = window.sessionStorage.getItem(key)
    if (msg) window.sessionStorage.removeItem(key)
    return msg
  })

  const chat = usePersistedChat({
    chatId,
    initialMessages: convQuery.data?.messages as UIMessage[] | undefined,
    initialMessagesVersion: convQuery.dataUpdatedAt,
    repoId: convQuery.data?.repoId ?? repo?.id,
  })

  const didSendInitial = useRef(false)
  useEffect(() => {
    if (
      !initialMessage ||
      didSendInitial.current ||
      convQuery.isPending ||
      chat.messages.length > 0
    )
      return
    didSendInitial.current = true
    void chat.sendMessage(initialMessage)
  }, [
    initialMessage,
    convQuery.isPending,
    chat.messages.length,
    chat.sendMessage,
  ])

  const title = convQuery.data?.title ?? "New chat"

  return (
    <div className="flex h-full flex-col items-center">
      {/* Header */}
      <div className="flex w-full max-w-[560px] shrink-0 items-center gap-2 px-3 pt-4 pb-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate({ to: "/home" })}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-tw-hover"
        >
          <ChevronLeftStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
        <span className="truncate text-[13px] font-medium text-tw-text-secondary">
          {title}
        </span>
      </div>

      {/* Chat thread */}
      <div className="min-h-0 w-full max-w-[560px] flex-1 overflow-auto px-3">
        <ChatThread
          messages={chat.messages}
          isLoading={chat.isLoading}
          error={chat.error}
          isQuotaExhausted={chat.isQuotaExhausted}
          respondToToolApproval={(id, approved) =>
            chat.addToolApprovalResponse({ id, approved })
          }
        />
      </div>

      {/* Input bar */}
      <div className="w-full max-w-[560px] shrink-0 px-3 pt-2 pb-4">
        <ChatComposer
          disabled={chat.isLoading || chat.isQuotaExhausted}
          isLoading={chat.isLoading}
          placeholder={
            chat.isQuotaExhausted ? "Out of credits" : "Ask anything..."
          }
          onSend={chat.sendMessage}
        />
      </div>
    </div>
  )
}
