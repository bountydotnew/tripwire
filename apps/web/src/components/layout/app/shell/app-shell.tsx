import { useState, useMemo } from "react"
import { parseCommand } from "#/lib/chat/commands"
import { useSlashCommandRunner } from "#/lib/chat/use-command-runner"
import { CommandConfirmation } from "#/components/layout/app/chat/command-confirmation"
import { motion, AnimatePresence } from "framer-motion"
import {
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { TopNav } from "#/components/layout/app/shell/top-nav"
import { WorkspaceRedirect } from "#/components/layout/app/shell/workspace-redirect"
import { WorkspaceProvider, useWorkspace } from "#/providers/workspace-context"
import { AuthProvider } from "@tripwire/auth/components"
import { ChatProvider, useAIChat } from "#/providers/chat-context"
import { Button } from "@tripwire/ui/button"
import { ChatComposer } from "#/components/layout/app/chat/chat-composer"
import { ChatThread } from "#/components/layout/app/chat/chat-thread"
import { useTRPC } from "#/integrations/trpc/react"
import { useCustomer } from "autumn-js/react"
import { useRequestNotifications } from "#/hooks/use-request-notifications"
import { useOnboardingRedirect } from "#/hooks/use-onboarding-redirect"
import Dither from "@tripwire/ui/dither"
import {
  Context,
  ContextTrigger,
  ContextContent,
  ContextContentHeader,
  ContextContentBody,
  ContextContentFooter,
  ContextInputUsage,
  ContextOutputUsage,
} from "#/components/shared/context-usage"
import { AI_MODEL_ID, getContextWindow } from "@tripwire/ai/model-config"
import { GithubIcon } from "@tripwire/ui/icons/github"
import { TripwireAskGlyphIcon18 } from "@tripwire/ui/icons/tripwire-ask-glyph-icon"
import {
  PlusStrokeIcon14,
  StrokeXIcon14,
  ChatBubbleOutlineIcon12,
  StrokeXIcon10Muted,
} from "@tripwire/ui/icons/app-chrome-icons"
import { ExpandChatIcon14 } from "@tripwire/ui/icons/expand-chat-icon"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { routes } from "#/lib/routes"

export function AppShell() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <ChatProvider>
          <AppShellInner />
        </ChatProvider>
      </WorkspaceProvider>
    </AuthProvider>
  )
}

function AppShellInner() {
  useRequestNotifications()
  useOnboardingRedirect()
  // Handles auto-redirects: no org in URL → default workspace, "_" placeholder → first repo

  const {
    isOpen,
    toggle,
    close,
    sendMessage,
    isLoading,
    isQuotaExhausted,
    newChat,
    conversationId,
    repoId: chatRepoId,
    messages: chatMessages,
  } = useAIChat()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repos, isLoading: workspaceLoading, orgs } = useWorkspace()
  const [mutationLoading, setMutationLoading] = useState(false)

  const { runCommand, runMutation, cancelMutation, pendingConfirmation } =
    useSlashCommandRunner()

  const routerState = useRouterState()
  const currentPath = routerState.location.pathname
  const isHomePage =
    currentPath === "/home" ||
    currentPath === "/" ||
    currentPath.endsWith("/home")
  const isChatRoute = currentPath.startsWith("/chat/")
  const isAutomationEditor = /\/automations\/[^/]+$/.test(currentPath)

  const needsInstall =
    !isChatRoute && !workspaceLoading && orgs.length > 0 && repos.length === 0

  const handleConfirmMutation = async () => {
    if (!pendingConfirmation) return
    setMutationLoading(true)
    try {
      await runMutation(pendingConfirmation)
    } finally {
      setMutationLoading(false)
    }
  }

  // Compute cumulative usage from message metadata, with estimation fallback
  const chatUsage = useMemo(() => {
    let inputTokens = 0
    let outputTokens = 0
    let costUSD = 0
    let hasMetadata = false

    for (const msg of chatMessages) {
      const meta = (msg as unknown as Record<string, unknown>).metadata as
        | Record<string, unknown>
        | undefined
      if (meta?.usage) {
        hasMetadata = true
        const u = meta.usage as Record<string, number>
        inputTokens += u.inputTokens ?? 0
        outputTokens += u.outputTokens ?? 0
      }
      if (typeof meta?.costUSD === "number") {
        costUSD += meta.costUSD
      }
    }

    // Fallback: estimate tokens from message text (~4 chars per token)
    if (!hasMetadata && chatMessages.length > 0) {
      for (const msg of chatMessages) {
        const parts = (msg as unknown as Record<string, unknown>).parts as
          | Array<{ type: string; text?: string; content?: string }>
          | undefined
        let charCount = 0
        if (parts) {
          for (const p of parts) {
            charCount += (p.text ?? p.content ?? "").length
          }
        }
        const estimated = Math.ceil(charCount / 4)
        if (msg.role === "user") inputTokens += estimated
        else outputTokens += estimated
      }
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      costUSD,
    }
  }, [chatMessages])

  const showSidePanel =
    !isHomePage && !isChatRoute && !isAutomationEditor && isOpen

  return (
    <div className="tw-root flex h-screen flex-col overflow-hidden bg-tw-bg antialiased">
      <WorkspaceRedirect />
      <TopNav askOpen={isOpen} onToggleAsk={toggle} />
      <div
        className={`flex min-h-0 flex-1 gap-2 ${isChatRoute ? "" : "px-2 pb-2"}`}
      >
        <div
          className={`relative min-w-0 flex-1 ${isChatRoute ? "" : "tw-inset"}`}
          style={
            isChatRoute ? undefined : { boxShadow: "#00000008 0px 1px 4px" }
          }
        >
          <div className="absolute inset-0 overflow-auto">
            {needsInstall ? <InstallGitHubPrompt /> : <Outlet />}
          </div>
        </div>

        <aside
          className="tw-inset shrink-0 transition-all duration-[360ms]"
          style={{
            width: showSidePanel ? 380 : 0,
            marginRight: showSidePanel ? 0 : -8,
            opacity: showSidePanel ? 1 : 0,
            transform: showSidePanel ? "translateX(0)" : "translateX(24px)",
            transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)",
          }}
        >
          {showSidePanel && (
            <div className="relative flex h-full w-full flex-col">
              {/* Dither background at the bottom with upward fade */}
              <div
                className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[350px]"
                style={{
                  maskImage:
                    "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
                  WebkitMaskImage:
                    "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
                }}
              >
                <Dither
                  waveColor={[
                    0.4627450980392157, 0.4627450980392157, 0.4627450980392157,
                  ]}
                  disableAnimation={false}
                  enableMouseInteraction={false}
                  mouseRadius={0.1}
                  colorNum={4}
                  pixelSize={2}
                  waveAmplitude={0.25}
                  waveFrequency={3}
                  waveSpeed={0.1}
                />
              </div>

              <div className="relative z-10 flex shrink-0 items-center justify-between pt-3 pr-2 pb-2 pl-3">
                <div className="flex min-w-0 items-center gap-2">
                  <TripwireAskGlyphIcon18 />
                  <span className="text-[14px] leading-none font-medium text-tw-text-primary">
                    Ask Tripwire
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Context
                    usedTokens={chatUsage.totalTokens}
                    maxTokens={getContextWindow(AI_MODEL_ID)}
                    usage={{
                      inputTokens: chatUsage.inputTokens,
                      outputTokens: chatUsage.outputTokens,
                    }}
                    modelId={AI_MODEL_ID}
                    costUSD={chatUsage.costUSD}
                  >
                    <ContextTrigger className="h-6 px-1.5 text-[11px] text-tw-text-muted" />
                    <ContextContent>
                      <ContextContentHeader />
                      <ContextContentBody>
                        <ContextInputUsage />
                        <ContextOutputUsage />
                      </ContextContentBody>
                      <ContextContentFooter />
                    </ContextContent>
                  </Context>
                  <CreditBalancePill />
                  <Button
                    variant="ghost"
                    onClick={() => {
                      queryClient.setQueryData(
                        trpc.chats.get.queryKey({ chatId: conversationId }),
                        {
                          id: conversationId,
                          userId: "",
                          repoId: chatRepoId ?? null,
                          title: null,
                          messages: chatMessages as unknown as Record<
                            string,
                            unknown
                          >[],
                          createdAt: new Date(),
                          updatedAt: new Date(),
                        }
                      )
                      close()
                      navigate({
                        to: "/chat/$chatId",
                        params: { chatId: conversationId },
                      })
                    }}
                    type="button"
                    className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
                    title="Open in full screen"
                  >
                    <ExpandChatIcon14 className="text-[#9F9FA9]" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={newChat}
                    type="button"
                    className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
                    title="New chat"
                  >
                    <PlusStrokeIcon14 className="text-[#9F9FA9]" />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={close}
                    type="button"
                    className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
                  >
                    <StrokeXIcon14 className="text-[#9F9FA9]" />
                  </Button>
                </div>
              </div>

              <div className="relative z-10 shrink-0 px-3 pb-3">
                <p className="text-[13px] leading-[19px] text-tw-text-secondary">
                  Ask about anything in your digest, or get help investigating a
                  flagged contributor.
                </p>
              </div>

              <div className="relative z-10 min-h-0 flex-1 overflow-auto px-2 pb-2 scroll-mask-y-from-[calc(100%-2rem)]">
                <ChatThread />
              </div>

              <div className="relative z-10">
                <SidebarRecentChats />
              </div>

              <div className="relative z-10 shrink-0 px-2 pb-2">
                {pendingConfirmation ? (
                  <CommandConfirmation
                    confirmation={pendingConfirmation}
                    onConfirm={handleConfirmMutation}
                    onCancel={cancelMutation}
                    isLoading={mutationLoading}
                  />
                ) : null}
                <ChatComposer
                  disabled={isLoading || isQuotaExhausted || mutationLoading}
                  isLoading={isLoading}
                  placeholder={
                    isQuotaExhausted
                      ? "Out of credits"
                      : "Ask anything, or type / for commands..."
                  }
                  onSend={sendMessage}
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
          )}
        </aside>
      </div>
    </div>
  )
}

function CreditBalancePill() {
  const { data: customer } = useCustomer()
  const balance = customer?.balances?.ai_credits

  if (!balance) return null

  const remaining = balance.remaining ?? 0
  const granted = balance.granted ?? 0
  const unlimited = balance.unlimited ?? false

  if (unlimited) return null

  const isEmpty = remaining <= 0
  const isLow = !isEmpty && granted > 0 && remaining / granted < 0.2

  return (
    <span
      className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[14px] font-medium tabular-nums transition-colors ${
        isEmpty
          ? "bg-red-500/10 text-red-400"
          : isLow
            ? "bg-amber-500/10 text-amber-400"
            : "bg-[#FAFAFA08] text-muted-foreground"
      }`}
    >
      ${(remaining / 100).toFixed(2)}
    </span>
  )
}

function SidebarRecentChats() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { loadChat, conversationId, open } = useAIChat()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const { repo } = useWorkspace()
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
                <ChatBubbleOutlineIcon12
                  className={`shrink-0 ${isActive ? "text-tw-text-primary" : "text-tw-text-muted"}`}
                />
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

function InstallGitHubPrompt() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <div className="flex size-12 items-center justify-center">
          <TripwireLogo className="size-8 text-tw-text-secondary" />
        </div>
        <div>
          <h2 className="mb-1 text-[15px] font-medium text-tw-text-primary">
            Install the GitHub App
          </h2>
          <p className="text-[13px] leading-relaxed text-tw-text-secondary">
            Connect a repository to start using Tripwire. You'll be able to
            configure rules, run automations, and monitor contributions.
          </p>
        </div>
        <Button variant="default" size="sm">
          <Link to={routes.api.githubInstall} className="flex gap-2">
            <GithubIcon className="mt-0.5 size-4" />
            Install GitHub App
          </Link>
        </Button>
      </div>
    </div>
  )
}
