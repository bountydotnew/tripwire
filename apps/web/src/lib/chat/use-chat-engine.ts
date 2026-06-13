import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useChat } from "@ai-sdk-tools/store"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useCustomer } from "autumn-js/react"
import { useRouterState } from "@tanstack/react-router"
import { createLogger } from "@tripwire/logger"
import { useTRPC } from "#/integrations/trpc/react"
import { extractChatTitle } from "#/lib/chat/extract-title"
import type { SerializedMessage, UIMessage } from "#/types/chat"

const logger = createLogger("chat")

interface ChatEngineOptions {
  chatId: string
  repoId: string | undefined
  initialMessages?: UIMessage[]
  /** Bump to re-hydrate when async-loaded initialMessages arrive. */
  initialMessagesVersion?: unknown
  /** Extra metadata sent on every request body. */
  extraRequestBody?: Record<string, unknown>
  /** Called after the AI finishes; receives the saved messages. */
  onFinishExtras?: (messages: UIMessage[]) => void
}

export interface ChatEngine {
  messages: UIMessage[]
  isLoading: boolean
  error: Error | null
  isQuotaExhausted: boolean
  sendMessage: (content: string) => void
  /** Resolved when the AI finishes sending the response. */
  addToolApprovalResponse: (response: { id: string; approved: boolean }) => void
  setMessages: ReturnType<typeof useChat<UIMessage>>["setMessages"]
  appendOptimisticMessage: (message: UIMessage) => void
  replaceOptimisticMessage: (id: string, message: UIMessage) => void
  clearChat: () => void
  refetchCustomer: () => void
}

/**
 * Shared chat engine: wires `useChat` to the persistence layer with
 * quota awareness, transport stability, optimistic helpers, and the
 * standard onFinish save flow. Both the side-panel ChatProvider and
 * the full-screen route chat use this.
 */
export function useChatEngine({
  chatId,
  repoId,
  initialMessages,
  initialMessagesVersion,
  extraRequestBody,
  onFinishExtras,
}: ChatEngineOptions): ChatEngine {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [chatError, setChatError] = useState<Error | null>(null)
  const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false)

  const { data: customer, refetch: refetchCustomer } = useCustomer()
  const aiBalance = customer?.balances?.ai_credits
  const isQuotaExhausted =
    quotaExhaustedByError ||
    (aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited)

  const requestBodyRef = useRef({
    repoId,
    conversationId: chatId,
    currentPage: currentPath,
    ...extraRequestBody,
  })
  requestBodyRef.current = {
    repoId,
    conversationId: chatId,
    currentPage: currentPath,
    ...extraRequestBody,
  }

  // The AI SDK keeps the Chat instance stable, so keep transport stable too
  // and read request metadata from a ref that updates on every render.
  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/chat",
        body: () => requestBodyRef.current,
      }),
    []
  )

  const saveMessages = useMutation(trpc.chats.saveMessages.mutationOptions())

  const {
    messages,
    sendMessage: sendChatMessage,
    status,
    addToolApprovalResponse,
    setMessages,
    error: chatHookError,
  } = useChat<UIMessage>({
    id: chatId,
    messages: initialMessages ?? [],
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (error) => {
      if (error.message.includes("429")) {
        setQuotaExhaustedByError(true)
        refetchCustomer()
        return
      }
      if (error.message.includes("Maximum update depth")) return
      logger.error(error.message)
      setChatError((prev) => (prev?.message === error.message ? prev : error))
    },
    onFinish: ({ messages: finishedMessages }) => {
      if (finishedMessages.length === 0) return
      saveMessages.mutate({
        chatId: requestBodyRef.current.conversationId,
        repoId: requestBodyRef.current.repoId,
        messages: finishedMessages as unknown as SerializedMessage[],
        title: extractChatTitle(finishedMessages),
      })
      queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() })
      refetchCustomer()
      onFinishExtras?.(finishedMessages)
    },
  })
  const isLoading = status === "submitted" || status === "streaming"

  // useChat only reads `messages` on first mount; rehydrate when async data arrives.
  useEffect(() => {
    if (!initialMessages?.length) return
    if (messages.length > 0) return
    setMessages(initialMessages)
  }, [initialMessagesVersion, initialMessages, messages.length, setMessages])

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isQuotaExhausted) return
      setChatError(null)
      void sendChatMessage({ text: content })
    },
    [sendChatMessage, isQuotaExhausted]
  )

  const appendOptimisticMessage = useCallback(
    (message: UIMessage) => {
      setMessages((prev) => [...prev, message])
    },
    [setMessages]
  )

  const replaceOptimisticMessage = useCallback(
    (id: string, message: UIMessage) => {
      setMessages((prev) => prev.map((m) => (m.id === id ? message : m)))
    },
    [setMessages]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setChatError(null)
  }, [setMessages])

  const combinedError = chatError || chatHookError || null

  return {
    messages,
    isLoading,
    error: isQuotaExhausted ? null : combinedError,
    isQuotaExhausted,
    sendMessage,
    addToolApprovalResponse,
    setMessages,
    appendOptimisticMessage,
    replaceOptimisticMessage,
    clearChat,
    refetchCustomer,
  }
}
