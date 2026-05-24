import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useRef,
  type ReactNode,
} from "react"
import { useChat, Provider as ChatStoreProvider } from "@ai-sdk-tools/store"
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai"
import type { UIMessage, SerializedMessage } from "#/types/chat"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useWorkspace } from "#/providers/workspace-context"
import { useRouterState } from "@tanstack/react-router"
import { useCustomer } from "autumn-js/react"
import { useTRPC } from "#/integrations/trpc/react"
import {
  broadcastWorkflowMutation,
  extractWorkflowIdsFromMessages,
  broadcastRuleMutation,
  extractRuleIdsFromMessages,
} from "#/lib/workflow/events"
import { extractChatTitle } from "#/lib/chat/extract-title"

export interface WorkflowContext {
  workflowId: string
}

interface ChatContextValue {
  // State
  messages: UIMessage[]
  isLoading: boolean
  isOpen: boolean
  error: Error | null
  isQuotaExhausted: boolean
  conversationId: string
  /** Effective repo for this chat (pinned / persisted / workspace). */
  repoId: string | undefined
  workflowContext: WorkflowContext | null

  // Actions
  sendMessage: (content: string) => void
  respondToToolApproval: (approvalId: string, approved: boolean) => void
  open: () => void
  close: () => void
  toggle: () => void
  clearChat: () => void
  loadChat: (chatId: string) => void
  newChat: () => string
  setWorkflowContext: (ctx: WorkflowContext | null) => void
  appendOptimisticMessage: (message: UIMessage) => void
  replaceOptimisticMessage: (id: string, message: UIMessage) => void
}

const defaultContextValue: ChatContextValue = {
  messages: [],
  isLoading: false,
  isOpen: false,
  error: null,
  isQuotaExhausted: false,
  conversationId: "",
  repoId: undefined,
  workflowContext: null,
  sendMessage: () => {},
  respondToToolApproval: () => {},
  open: () => {},
  close: () => {},
  toggle: () => {},
  clearChat: () => {},
  loadChat: () => void 0,
  newChat: () => "",
  setWorkflowContext: () => {},
  appendOptimisticMessage: () => {},
  replaceOptimisticMessage: () => {},
}

const ChatContext = createContext<ChatContextValue>(defaultContextValue)

interface ChatProviderProps {
  children: ReactNode
}

export function ChatProvider({ children }: ChatProviderProps) {
  return (
    <ChatStoreProvider>
      <ChatProviderClient>{children}</ChatProviderClient>
    </ChatStoreProvider>
  )
}

const STORAGE_KEY_CONV = "tw.askConversationId"
const STORAGE_KEY_OPEN = "tw.askOpen"

function getStoredValue(key: string): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(key)
}

function setStoredValue(key: string, value: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value)
  }
}

function ChatProviderClient({ children }: ChatProviderProps) {
  const { repo, repos, setRepo } = useWorkspace()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(() => {
    return getStoredValue(STORAGE_KEY_OPEN) === "true"
  })
  const [chatError, setChatError] = useState<Error | null>(null)
  const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false)

  // Check quota proactively via Autumn's customer data
  const { data: customer, refetch: refetchCustomer } = useCustomer()
  const aiBalance = customer?.balances?.ai_credits
  const isQuotaExhausted =
    quotaExhaustedByError ||
    (aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited)

  // Persist conversation ID so it survives reload
  const [conversationId, setConversationId] = useState(() => {
    const stored = getStoredValue(STORAGE_KEY_CONV)
    if (stored) return stored
    const id = crypto.randomUUID()
    setStoredValue(STORAGE_KEY_CONV, id)
    return id
  })

  const [workflowContext, setWorkflowContext] =
    useState<WorkflowContext | null>(null)

  // When a persisted chat is loaded, pin to the repoId it was created against
  // so subsequent /api/chat requests target that repo even if the user has
  // since switched workspace. `null` means "fall back to current workspace
  // repo" (legacy conversations with no recorded repoId, or fresh chats).
  const [pinnedRepoId, setPinnedRepoId] = useState<string | null>(null)

  // Track whether we've created the DB row for this conversation
  const createdConvIds = useRef(new Set<string>())

  // Load persisted conversation on mount / when conversationId changes
  const convQuery = useQuery(
    trpc.chats.get.queryOptions({ chatId: conversationId })
  )
  const persistedMessages =
    (convQuery.data?.messages as UIMessage[] | undefined) ?? []
  const persistedRepoId = convQuery.data?.repoId ?? null
  const conversationExists = !!convQuery.data

  // Resolve the effective repoId we'll send: pinned wins over the live workspace.
  const effectiveRepoId = pinnedRepoId ?? persistedRepoId ?? repo?.id

  const requestBodyRef = useRef({
    repoId: effectiveRepoId,
    conversationId,
    currentPage: currentPath,
    workflowId: workflowContext?.workflowId ?? undefined,
  })
  requestBodyRef.current = {
    repoId: effectiveRepoId,
    conversationId,
    currentPage: currentPath,
    workflowId: workflowContext?.workflowId ?? undefined,
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

  // Create conversation + save when AI finishes.
  const createConv = useMutation(trpc.chats.create.mutationOptions())
  const saveMessages = useMutation(trpc.chats.saveMessages.mutationOptions())

  const {
    messages,
    sendMessage: sendChatMessage,
    status,
    addToolApprovalResponse,
    setMessages,
    error: chatHookError,
  } = useChat<UIMessage>({
    id: conversationId,
    messages: persistedMessages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onError: (error) => {
      if (error.message.includes("429")) {
        setQuotaExhaustedByError(true)
        refetchCustomer()
        return
      }
      if (error.message.includes("Maximum update depth")) return
      console.error("[chat]", error.message)
      setChatError((prev) => (prev?.message === error.message ? prev : error))
    },
    onFinish: ({ messages }) => {
      if (messages.length === 0) return
      saveMessages.mutate({
        chatId: requestBodyRef.current.conversationId,
        repoId: effectiveRepoId,
        messages: messages as unknown as SerializedMessage[],
        title: extractChatTitle(messages),
      })
      queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() })
      refetchCustomer()

      const mutatedIds = extractWorkflowIdsFromMessages(messages)
      for (const wfId of mutatedIds) {
        broadcastWorkflowMutation(wfId)
      }
      if (mutatedIds.length > 0 && effectiveRepoId) {
        queryClient.invalidateQueries({
          queryKey: trpc.workflows.list.queryKey({ repoId: effectiveRepoId }),
        })
      }

      const mutatedRuleIds = extractRuleIdsFromMessages(messages)
      for (const ruleId of mutatedRuleIds) {
        broadcastRuleMutation(ruleId)
      }
      if (mutatedRuleIds.length > 0 && effectiveRepoId) {
        queryClient.invalidateQueries({
          queryKey: trpc.customRules.list.queryKey({ repoId: effectiveRepoId }),
        })
      }
    },
  })
  const isLoading = status === "submitted" || status === "streaming"

  // Combine hook error with our custom error state
  const combinedError = chatError || chatHookError || null

  // Persist isOpen state
  const updateIsOpen = useCallback((value: boolean) => {
    setIsOpen(value)
    setStoredValue(STORAGE_KEY_OPEN, String(value))
  }, [])

  const open = useCallback(() => updateIsOpen(true), [updateIsOpen])
  const close = useCallback(() => updateIsOpen(false), [updateIsOpen])
  const toggle = useCallback(
    () => updateIsOpen(!isOpen),
    [isOpen, updateIsOpen]
  )

  const sendMessage = useCallback(
    (content: string) => {
      if (!content.trim() || isQuotaExhausted) return
      setChatError(null)

      const activeConvId = requestBodyRef.current.conversationId
      if (!conversationExists && !createdConvIds.current.has(activeConvId)) {
        createdConvIds.current.add(activeConvId)
        createConv.mutate(
          { id: activeConvId, repoId: effectiveRepoId },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: trpc.chats.list.queryKey(),
              })
            },
          }
        )
      }

      void sendChatMessage({ text: content })
      setTimeout(() => refetchCustomer(), 2000)
    },
    [
      conversationExists,
      sendChatMessage,
      isQuotaExhausted,
      refetchCustomer,
      conversationId,
      effectiveRepoId,
    ]
  )

  const respondToToolApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({ id: approvalId, approved })
    },
    [addToolApprovalResponse]
  )

  const clearChat = useCallback(() => {
    setMessages([])
    setChatError(null)
  }, [setMessages])

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

  const loadChat = useCallback(
    (chatId: string) => {
      setChatError(null)
      setConversationId(chatId)
      setStoredValue(STORAGE_KEY_CONV, chatId)
      createdConvIds.current.add(chatId)

      // Pin the chat to its stored repo so subsequent sends target that
      // repo even if the user switches workspace. The caller should have
      // already fetched the chat into the query cache before calling this.
      const cached = queryClient.getQueryData(
        trpc.chats.get.queryKey({ chatId })
      ) as { repoId: string | null } | undefined
      const storedRepoId = cached?.repoId ?? null
      if (storedRepoId) {
        setPinnedRepoId(storedRepoId)
        if (repo?.id !== storedRepoId) {
          const target = repos.find((r) => r.id === storedRepoId)
          if (target) setRepo(target)
        }
      } else {
        setPinnedRepoId(null)
      }
    },
    [queryClient, trpc.chats.get, repo?.id, repos, setRepo]
  )

  const newChat = useCallback(() => {
    const id = crypto.randomUUID()
    setConversationId(id)
    setStoredValue(STORAGE_KEY_CONV, id)
    setMessages([])
    setChatError(null)
    setPinnedRepoId(null)
    requestBodyRef.current = { ...requestBodyRef.current, conversationId: id }
    return id
  }, [setMessages])

  const value: ChatContextValue = {
    messages,
    isLoading,
    isOpen,
    error: isQuotaExhausted ? null : combinedError,
    isQuotaExhausted,
    conversationId,
    repoId: effectiveRepoId,
    workflowContext,
    sendMessage,
    respondToToolApproval,
    open,
    close,
    toggle,
    clearChat,
    loadChat,
    newChat,
    setWorkflowContext,
    appendOptimisticMessage,
    replaceOptimisticMessage,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useAIChat() {
  return useContext(ChatContext)
}
