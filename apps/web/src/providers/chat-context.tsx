import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { Provider as ChatStoreProvider } from "@ai-sdk-tools/store"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useWorkspace } from "#/providers/workspace-context"
import { useRegisterChatSurface } from "#/providers/repo-switch-gate"
import { useTRPC } from "#/integrations/trpc/react"
import { useChatEngine } from "#/lib/chat/use-chat-engine"
import { buildContextSwitchMarker } from "#/lib/chat/markers"
import {
  broadcastRuleMutation,
  broadcastWorkflowMutation,
  extractRuleIdsFromMessages,
  extractWorkflowIdsFromMessages,
} from "#/lib/workflow/events"
import type { UIMessage } from "#/types/chat"

export interface WorkflowContext {
  workflowId: string
}

interface ChatContextValue {
  messages: UIMessage[]
  isLoading: boolean
  isOpen: boolean
  error: Error | null
  isQuotaExhausted: boolean
  conversationId: string
  /** Effective repo for this chat (pinned / persisted / workspace). */
  repoId: string | undefined
  workflowContext: WorkflowContext | null

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

const STORAGE_KEY_OPEN = "tw.askOpen"

/**
 * Per-org localStorage key for the side-panel's active conversation.
 * Conversations are org-scoped (billing, tools, repo set all change),
 * so each org remembers its own thread independently. Switching orgs
 * loads the new org's slot and clears in-memory state from the old one.
 */
function storageKeyConv(orgId: string): string {
  return `tw.askConversationId:${orgId}`
}

function getStoredValue(key: string): string | null {
  return typeof window === "undefined" ? null : window.localStorage.getItem(key)
}

function setStoredValue(key: string, value: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(key, value)
  }
}

function ChatProviderClient({ children }: ChatProviderProps) {
  const { org, repo, repos, setRepo } = useWorkspace()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [isOpen, setIsOpen] = useState(() => {
    return getStoredValue(STORAGE_KEY_OPEN) === "true"
  })

  // The conversation id is keyed by active org. We can't read the key
  // until the workspace context has resolved `org` (it's null on first
  // render). Use a placeholder uuid; the effect below replaces it once
  // the org id is known, and again whenever the user switches orgs.
  const [conversationId, setConversationId] = useState<string>(() =>
    crypto.randomUUID()
  )

  const [workflowContext, setWorkflowContext] =
    useState<WorkflowContext | null>(null)

  // Track whether we've created the DB row for this conversation
  const createdConvIds = useRef(new Set<string>())

  // Switch the side-panel thread to this org's slot whenever the active
  // org changes. Chats are billed and scoped per org, so carrying the
  // same conversation across orgs would silently bill A for messages
  // sent under B's context. Per-org slot = clean isolation.
  //
  // The engine.setMessages reset (the in-memory AI-SDK buffer) lives in
  // a second effect below — engine isn't constructed yet at this point.
  useEffect(() => {
    if (!org?.id) return
    const key = storageKeyConv(org.id)
    let nextId = getStoredValue(key)
    if (!nextId) {
      nextId = crypto.randomUUID()
      setStoredValue(key, nextId)
    }
    setConversationId((prev) => (prev === nextId ? prev : nextId))
  }, [org?.id])

  const convQuery = useQuery(
    trpc.chats.get.queryOptions({ chatId: conversationId })
  )
  const persistedMessages =
    (convQuery.data?.messages as UIMessage[] | undefined) ?? []
  const persistedRepoId = convQuery.data?.repoId ?? null
  const conversationExists = !!convQuery.data

  // Current workspace repo wins. The conversation's stored repo is
  // only a fallback for when the workspace hasn't hydrated yet (fresh
  // page load). When the user switches repos mid-chat, the repo-switch
  // gate prompts for confirmation; if they proceed, the next message
  // uses the new repo.
  const effectiveRepoId = repo?.id ?? persistedRepoId ?? undefined

  const createConv = useMutation(trpc.chats.create.mutationOptions())

  const engine = useChatEngine({
    chatId: conversationId,
    repoId: effectiveRepoId,
    initialMessages: persistedMessages,
    extraRequestBody: {
      workflowId: workflowContext?.workflowId ?? undefined,
    },
    onFinishExtras: (messages) => {
      const mutatedWorkflowIds = extractWorkflowIdsFromMessages(messages)
      for (const wfId of mutatedWorkflowIds) {
        broadcastWorkflowMutation(wfId)
      }
      if (mutatedWorkflowIds.length > 0 && effectiveRepoId) {
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

  // Clear the AI-SDK's in-memory message buffer when the active org
  // changes. Without this, the user would see the previous org's
  // streamed transcript stuck in the panel until they navigate or
  // start a new chat — the conversationId already swapped (above),
  // but useChat's local store doesn't auto-reset on id change.
  const prevOrgIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (!org?.id) return
    if (prevOrgIdRef.current === null) {
      prevOrgIdRef.current = org.id
      return
    }
    if (prevOrgIdRef.current === org.id) return
    prevOrgIdRef.current = org.id
    engine.setMessages([])
  }, [org?.id, engine])

  // Register this side-panel surface with the repo-switch gate so the
  // workspace switcher prompts for confirmation when the user tries
  // to swap repos out from under an active conversation.
  //
  // The "new chat" branch needs to mint a fresh conversation id and
  // clear the engine in one go — without that, a plain
  // engine.clearChat would leave the previous messages persisted on
  // the same DB row and the next send would merge them back in.
  // We capture `newChat` via a ref so the registration effect doesn't
  // re-fire on every render.
  const newChatRef = useRef<() => string>(() => "")
  useRegisterChatSurface("side-panel", {
    hasMessages: engine.messages.length > 0,
    isOpen,
    startNewChatWithMarker: (repoName) => {
      newChatRef.current()
      const marker = buildContextSwitchMarker(repoName)
      engine.setMessages([marker])
    },
    appendMarker: (repoName) => {
      const marker = buildContextSwitchMarker(repoName)
      engine.setMessages((prev) => [...prev, marker])
    },
  })

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
      if (!content.trim() || engine.isQuotaExhausted) return

      if (!conversationExists && !createdConvIds.current.has(conversationId)) {
        createdConvIds.current.add(conversationId)
        createConv.mutate(
          { id: conversationId, repoId: effectiveRepoId },
          {
            onSuccess: () => {
              queryClient.invalidateQueries({
                queryKey: trpc.chats.list.queryKey(),
              })
            },
          }
        )
      }

      engine.sendMessage(content)
      setTimeout(() => engine.refetchCustomer(), 2000)
    },
    [
      engine,
      conversationExists,
      conversationId,
      createConv,
      effectiveRepoId,
      queryClient,
      trpc.chats.list,
    ]
  )

  const respondToToolApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      engine.addToolApprovalResponse({ id: approvalId, approved })
    },
    [engine]
  )

  const loadChat = useCallback(
    (chatId: string) => {
      setConversationId(chatId)
      if (org?.id) setStoredValue(storageKeyConv(org.id), chatId)
      createdConvIds.current.add(chatId)

      // When opening an old chat from history, rehydrate the workspace
      // to that chat's last-used repo. Subsequent sends follow the
      // workspace selection (no hard pin); switching mid-chat goes
      // through the repo-switch confirmation gate.
      const cached = queryClient.getQueryData(
        trpc.chats.get.queryKey({ chatId })
      ) as { repoId: string | null } | undefined
      const storedRepoId = cached?.repoId ?? null
      if (storedRepoId && repo?.id !== storedRepoId) {
        const target = repos.find((r) => r.id === storedRepoId)
        if (target) setRepo(target)
      }
    },
    [queryClient, trpc.chats.get, repo?.id, repos, setRepo, org?.id]
  )

  const newChat = useCallback(() => {
    const id = crypto.randomUUID()
    setConversationId(id)
    if (org?.id) setStoredValue(storageKeyConv(org.id), id)
    engine.setMessages([])
    return id
  }, [engine, org?.id])

  // The repo-switch gate registration above captured `newChat` via a
  // ref so it can fire the latest closure on demand without having
  // the registration effect re-run on every dependency change.
  newChatRef.current = newChat

  const value: ChatContextValue = {
    messages: engine.messages,
    isLoading: engine.isLoading,
    isOpen,
    error: engine.error,
    isQuotaExhausted: engine.isQuotaExhausted,
    conversationId,
    repoId: effectiveRepoId,
    workflowContext,
    sendMessage,
    respondToToolApproval,
    open,
    close,
    toggle,
    clearChat: engine.clearChat,
    loadChat,
    newChat,
    setWorkflowContext,
    appendOptimisticMessage: engine.appendOptimisticMessage,
    replaceOptimisticMessage: engine.replaceOptimisticMessage,
  }

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useAIChat() {
  return useContext(ChatContext)
}
