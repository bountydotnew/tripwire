import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { Button } from "@tripwire/ui/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useState, useRef, useEffect } from "react"
import { ChatComposer } from "#/components/layout/app/chat/chat-composer"
import { ChatThread } from "#/components/layout/app/chat/chat-thread"
import { usePersistedChat } from "#/hooks/use-persisted-chat"
import { useWorkspace, useWorkspacePath } from "#/providers/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { parseCommand } from "#/lib/chat/commands"
import { useSlashCommandRunner } from "#/lib/chat/use-command-runner"
import { CommandConfirmation } from "#/components/layout/app/chat/command-confirmation"
import { ChevronLeftStrokeIcon14 } from "@tripwire/ui/icons/app-chrome-icons"
import { uiMessagesFromStored } from "#/lib/chat/conversation-stored"
import { Provider as ChatStoreProvider } from "@ai-sdk-tools/store"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

function ChatRoute() {
  return (
    <ChatStoreProvider>
      <ChatPage />
    </ChatStoreProvider>
  )
}

export const Route = createFileRoute("/_app/chat/$chatId")({
  // Prefetch the chat's conversation thread so the page renders against
  // a warm cache when the user navigates in from anywhere.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.chats.get.queryOptions({ chatId: params.chatId }),
    )
  },
  component: ChatRoute,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Chat"),
      description:
        "Ask Tripwire about contributors, rules, events, and your repo's protection posture.",
      robots: "noindex",
    }),
})

function ChatPage() {
  const { chatId } = Route.useParams()
  const navigate = useNavigate()
  const { repo } = useWorkspace()
  const homePath = useWorkspacePath("home")
  const trpc = useTRPC()

  const queryClient = useQueryClient()
  const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId }))
  const generateTitle = useMutation({
    ...trpc.chats.generateTitle.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.chats.get.queryKey({ chatId }),
      })
      queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() })
    },
  })

  // Read after mount — useState initializer only runs on SSR too (no sessionStorage).
  const [initialMessage, setInitialMessage] = useState<string | null>(null)
  useEffect(() => {
    const key = `tw.chat.init.${chatId}`
    const msg = window.sessionStorage.getItem(key)
    if (!msg) return
    setInitialMessage(msg)
  }, [chatId])

  const chat = usePersistedChat({
    chatId,
    initialMessages: convQuery.data?.messages
      ? uiMessagesFromStored(convQuery.data.messages)
      : undefined,
    initialMessagesVersion: convQuery.dataUpdatedAt,
    repoId: convQuery.data?.repoId ?? repo?.id,
  })

  const didSendInitial = useRef(false)
  const [mutationLoading, setMutationLoading] = useState(false)

  const effectiveRepoId = convQuery.data?.repoId ?? repo?.id ?? chat.repoId

  const { runCommand, runMutation, cancelMutation, pendingConfirmation } =
    useSlashCommandRunner({
      chatId,
      appendOptimisticMessage: chat.appendOptimisticMessage,
      replaceOptimisticMessage: chat.replaceOptimisticMessage,
      clearChat: chat.clearChat,
      newChat: () => {
        const nextChatId = crypto.randomUUID()
        navigate({
          to: "/chat/$chatId",
          params: { chatId: nextChatId },
        })
      },
      repoId: effectiveRepoId,
    })

  useEffect(() => {
    if (!initialMessage || didSendInitial.current || chat.messages.length > 0)
      return

    const repoIdForChat = convQuery.data?.repoId ?? repo?.id
    if (!repoIdForChat) {
      return
    }

    didSendInitial.current = true
    if (initialMessage.trim().length > 10) {
      const titleKey = `tw.chat.title.${chatId}`
      if (!window.sessionStorage.getItem(titleKey)) {
        window.sessionStorage.setItem(titleKey, "true")
        generateTitle.mutate({ chatId, messageText: initialMessage.trim() })
      }
    }
    const parsed = parseCommand(initialMessage.trim())
    if (parsed) {
      void runCommand(parsed)
      return
    }
    void chat.sendMessage(initialMessage)
  }, [
    initialMessage,
    convQuery.data?.repoId,
    repo?.id,
    chat.messages.length,
    chat.sendMessage,
    runCommand,
    chatId,
    generateTitle,
  ])

  useEffect(() => {
    if (!initialMessage) return
    const hasAssistantMessage = chat.messages.some(
      (msg) => msg.role === "assistant"
    )
    if (!hasAssistantMessage) return
    window.sessionStorage.removeItem(`tw.chat.init.${chatId}`)
    window.sessionStorage.removeItem(`tw.chat.title.${chatId}`)
  }, [chat.messages, chatId, initialMessage])

  const handleConfirmMutation = async () => {
    if (!pendingConfirmation) return
    setMutationLoading(true)
    try {
      await runMutation(pendingConfirmation)
    } finally {
      setMutationLoading(false)
    }
  }

  const title = convQuery.data?.title ?? "New chat"

  return (
    <div className="flex h-full flex-col items-center">
      <div className="flex w-full max-w-[560px] shrink-0 items-center gap-2 px-3 pt-4 pb-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate({ to: homePath })}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-tw-hover"
        >
          <ChevronLeftStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
        <span className="truncate text-[13px] font-medium text-tw-text-secondary">
          {title}
        </span>
      </div>

      <div className="min-h-0 w-full max-w-[560px] flex-1 overflow-auto px-3">
        <ChatThread
          messages={chat.messages}
          isLoading={chat.isLoading}
          error={chat.error}
          isQuotaExhausted={chat.isQuotaExhausted}
          footer={
            pendingConfirmation ? (
              <CommandConfirmation
                confirmation={pendingConfirmation}
                onConfirm={handleConfirmMutation}
                onCancel={cancelMutation}
                isLoading={mutationLoading}
              />
            ) : null
          }
          respondToToolApproval={(id, approved) =>
            chat.addToolApprovalResponse({ id, approved })
          }
        />
      </div>

      <div className="w-full max-w-[560px] shrink-0 px-3 pt-2 pb-4">
        <ChatComposer
          disabled={chat.isLoading || chat.isQuotaExhausted || mutationLoading}
          isLoading={chat.isLoading}
          placeholder={
            chat.isQuotaExhausted
              ? "Out of credits"
              : "Ask anything, or type / for commands..."
          }
          onSend={chat.sendMessage}
          slashCommandRunner={{
            run: async (raw) => {
              const parsed = parseCommand(raw.trim())
              if (!parsed) {
                return { status: "error", message: "Unknown command" }
              }
              const result = await runCommand(parsed)
              if (result.kind === "error") {
                return { status: "error", message: result.message }
              }
              return { status: "done" }
            },
          }}
        />
      </div>
    </div>
  )
}
