// biome-ignore-all lint/correctness/noRestrictedElements: needed here because ui breaks without... todo: fix????

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@tripwire/ui/dialog"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { motion, AnimatePresence } from "framer-motion"
import { ChatComposer } from "#/components/layout/app/chat/chat-composer"
import { EventGroupCard } from "#/components/layout/app/home/event-group-card"
import { toastManager } from "@tripwire/ui/toast"
import type { TripwireEvent, EventAction } from "#/types/home"
import { useAuth } from "@tripwire/auth/components"
import { useWorkspace, useWorkspacePath } from "#/providers/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import {
  OnboardingCheckCircleIcon14,
  SmallCheckStrokeIcon12,
  StrokeXIcon10Muted,
} from "@tripwire/ui/icons/app-chrome-icons"
import { parseCommand } from "#/lib/chat/commands"
import { formatRelativeTime } from "#/lib/format"

export const Route = createFileRoute("/_app/$orgHandle/home")({
  component: HomePage,
})

function HomePage() {
  const { user } = useAuth()
  const { repo } = useWorkspace()
  const eventsPath = useWorkspacePath("events")
  const rulesPath = useWorkspacePath("rules")
  const integrationsPath = useWorkspacePath("integrations")
  const trpc = useTRPC()
  const navigate = useNavigate()

  // Lightweight check for setup progress
  const rulesCountQuery = useQuery({
    ...trpc.rules.countEnabled.queryOptions({ repoId: repo?.id ?? "" }),
    enabled: !!repo?.id,
    staleTime: 60_000,
  })

  // Fetch real events when repo is available
  const digestQuery = useQuery({
    ...trpc.events.digest.queryOptions({
      repoId: repo?.id ?? "",
      limit: 48,
      hours: 48,
    }),
    enabled: !!repo?.id,
  })

  const DIGEST_PAGE_SIZE = 8
  const [visibleCount, setVisibleCount] = useState(DIGEST_PAGE_SIZE)

  // Transform API response to TripwireEvent format for display
  const apiEvents: (TripwireEvent & { _eventId: string })[] =
    digestQuery.data?.groups.map((g) => {
      const event = g.primaryEvent
      return {
        id: event.id,
        kind: event.action,
        severity: (event.severity || "warning") as
          | "warning"
          | "error"
          | "success",
        title: getEventTitle(event.action, event.severity),
        preview: event.description || "",
        users: g.users.filter((u): u is string => u !== null),
        repo: event.repoId,
        ref: event.githubRef || "",
        contentType: event.contentType || "issue",
        createdAt: formatRelativeTime(event.createdAt),
        ruleFired: event.ruleName || null,
        groupKey: g.groupKey,
        action: getEventAction(event.action),
        // Store the actual event ID for navigation
        _eventId: event.id,
      }
    }) ?? []

  const events = apiEvents

  // Group events by groupKey
  const groups: Array<{ key: string; items: TripwireEvent[] }> = []
  const seen = new Map<string, number>()

  for (const e of events) {
    const k = e.groupKey ?? e.id
    if (!seen.has(k)) {
      seen.set(k, groups.length)
      groups.push({ key: k, items: [] })
    }
    const idx = seen.get(k)
    if (idx !== undefined) {
      groups[idx].items.push(e)
    }
  }

  const handleOpenEvent = (event: TripwireEvent) => {
    // Navigate to event detail page
    const eventId =
      (event as TripwireEvent & { _eventId?: string })._eventId || event.id
    // Use type assertion for dynamic route until types are regenerated
    navigate({ to: "/events/$eventId" as const, params: { eventId } } as never)
  }

  const userName = user?.name?.split(" ")[0] || "there"

  return (
    <div className="relative min-h-full pb-[240px]">
      <div className="mx-auto mt-20 flex w-[672px] max-w-2xl flex-col items-start gap-2 px-4">
        {/* Hero section */}
        <div className="flex w-full flex-col items-start gap-2 rounded-xl px-2 py-1">
          <h1
            className="m-0 text-[28px] leading-[36px] text-tw-text-primary"
            style={{
              fontFamily: "'Playfair Display', serif",
              fontWeight: 500,
            }}
          >
            Welcome back, {userName}!
          </h1>
          <p className="m-0 w-full text-[16px] leading-[22px] font-normal whitespace-nowrap text-[#EEEEEE80]">
            {digestQuery.data?.totalEvents ?? 0} events in the last 48 hours
          </p>
        </div>

        {/* Loading state */}
        {repo && digestQuery.isPending && (
          <div className="flex w-full items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
          </div>
        )}

        {/* Event groups */}
        {!digestQuery.isPending && (
          <div className="mt-1 flex w-full flex-col items-start gap-3">
            {groups.slice(0, visibleCount).map((g, i) => (
              <motion.div
                key={g.key}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.25,
                  delay:
                    i >= visibleCount - DIGEST_PAGE_SIZE
                      ? Math.min((i % DIGEST_PAGE_SIZE) * 0.025, 0.18)
                      : 0,
                  ease: [0.19, 1, 0.22, 1],
                }}
                className="w-full"
              >
                <EventGroupCard group={g} onOpenEvent={handleOpenEvent} />
              </motion.div>
            ))}
          </div>
        )}

        {!digestQuery.isPending && groups.length > visibleCount && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => setVisibleCount((c) => c + DIGEST_PAGE_SIZE)}
            className="mx-auto mt-2 self-center text-center text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
          >
            Show {Math.min(DIGEST_PAGE_SIZE, groups.length - visibleCount)} more
          </Button>
        )}

        {/* Empty state — setup checklist */}
        {!digestQuery.isPending &&
          groups.length === 0 &&
          repo &&
          (() => {
            const enabledRules = rulesCountQuery.data?.enabled ?? 0
            const steps = [
              {
                done: true,
                label: "Connect a repository",
                to: integrationsPath,
              },
              {
                done: enabledRules > 0,
                label: "Enable moderation rules",
                to: `${rulesPath}/marketplace`,
              },
              {
                done: false,
                label: "Add trusted contributors to allowlist",
                to: `${rulesPath}/people`,
              },
              {
                done: false,
                label: "Set up repo files (RULES.md, AGENTS.md)",
                to: `${rulesPath}/files`,
              },
            ]
            return (
              <div className="mt-2 flex w-full flex-col gap-3">
                <div className="flex flex-col gap-0.5 rounded-xl bg-tw-card p-1">
                  {steps.map((step) => (
                    <Link
                      key={step.label}
                      to={step.to}
                      className="group flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors hover:bg-tw-hover"
                    >
                      <div className="flex items-center gap-2.5">
                        {step.done ? (
                          <OnboardingCheckCircleIcon14 className="shrink-0 text-tw-success" />
                        ) : (
                          <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-tw-border" />
                        )}
                        <span
                          className={`text-[13px] ${step.done ? "text-tw-text-tertiary" : "text-tw-text-primary"}`}
                        >
                          {step.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-tw-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
                        →
                      </span>
                    </Link>
                  ))}
                </div>
                <p className="m-0 px-1 text-[11px] text-tw-text-tertiary">
                  Flagged PRs, issues, and comments will show up here once rules
                  are active.
                </p>
              </div>
            )
          })()}

        {groups.length > 0 && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => navigate({ to: eventsPath })}
            className="mx-auto mt-3 self-center text-center text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
          >
            View all events →
          </Button>
        )}

        {/* Recent chats */}
        <RecentChats />
      </div>

      {/* Floating Ask bar */}
      <HomeFloatingBar />
    </div>
  )
}

function HomeFloatingBar() {
  const navigate = useNavigate()
  const { repo } = useWorkspace()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const createChat = useMutation(trpc.chats.create.mutationOptions())

  const handleSubmit = async (message: string) => {
    const trimmedMessage = message.trim()
    if (!trimmedMessage) return
    const chatId = crypto.randomUUID()

    const listKey = trpc.chats.list.queryKey({ limit: 5 })
    queryClient.setQueryData(
      listKey,
      (
        old:
          | Array<{
              id: string
              title: string | null
              repoId: string | null
              createdAt: Date
              updatedAt: Date
            }>
          | undefined
      ) => [
        {
          id: chatId,
          title: null,
          repoId: repo?.id ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        ...(old ?? []).slice(0, 4),
      ]
    )

    try {
      await createChat.mutateAsync({ id: chatId, repoId: repo?.id })
      window.sessionStorage.setItem(`tw.chat.init.${chatId}`, trimmedMessage)
      navigate({ to: "/chat/$chatId", params: { chatId } })
    } catch (err) {
      toastManager.add({
        type: "error",
        title: "Failed to start chat",
        description: err instanceof Error ? err.message : "Please try again.",
      })
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-30 flex w-[560px] max-w-[calc(100%-32px)] -translate-x-1/2 flex-col items-center gap-1.5">
      <ChatComposer
        className="w-full shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]"
        disabled={createChat.isPending}
        isLoading={createChat.isPending}
        placeholder="Ask anything, or type / for commands..."
        onSend={(message) => {
          void handleSubmit(message)
        }}
        slashCommandRunner={{
          run: async (raw) => {
            const trimmed = raw.trim()
            if (!parseCommand(trimmed)) {
              return { status: "error", message: "Unknown command" }
            }
            const chatId = crypto.randomUUID()
            try {
              await createChat.mutateAsync({ id: chatId, repoId: repo?.id })
              window.sessionStorage.setItem(`tw.chat.init.${chatId}`, trimmed)
              navigate({
                to: "/chat/$chatId",
                params: { chatId },
              })
              return { status: "done" }
            } catch (err) {
              toastManager.add({
                type: "error",
                title: "Failed to start chat",
                description:
                  err instanceof Error ? err.message : "Please try again.",
              })
              return { status: "error" }
            }
          },
        }}
        contextActionAdornment={
          <span className="ml-0.5 flex items-center pr-2">
            <IntegrationChip fill="#533AFD" kind="figma" />
            <IntegrationChip fill="#5E6AD2" kind="linear" />
            <IntegrationChip fill="#000000" kind="github" />
          </span>
        }
      />
    </div>
  )
}

function RecentChats() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [clearAllOpen, setClearAllOpen] = useState(false)
  const chatsQuery = useQuery(trpc.chats.list.queryOptions({ limit: 5 }))
  const chats = chatsQuery.data ?? []

  const listQueryKey = trpc.chats.list.queryKey({ limit: 5 })
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

  const deleteAllChats = useMutation(
    trpc.chats.deleteAll.mutationOptions({
      onMutate: async () => {
        setClearAllOpen(false)
        await queryClient.cancelQueries({ queryKey: listQueryKey })
        const previous = queryClient.getQueryData(listQueryKey)
        queryClient.setQueryData(listQueryKey, [])
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
    <div className="mt-8 w-full">
      <div className="mb-2 flex items-center justify-between px-2">
        <h2 className="text-[13px] font-medium tracking-wider text-tw-text-muted uppercase">
          Recent chats
        </h2>
        <button
          type="button"
          onClick={() => setClearAllOpen(true)}
          className="text-[11px] font-medium text-tw-text-muted transition-colors hover:text-red-400"
        >
          Clear all
        </button>
      </div>

      <Dialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <DialogContent showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-base">Clear all chats</DialogTitle>
            <DialogDescription>
              This will permanently delete all your chat history. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare">
            <DialogClose render={<Button variant="ghost" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              onClick={() => deleteAllChats.mutate()}
              className="bg-red-500 text-white hover:bg-red-600"
            >
              Delete all chats
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <div className="flex flex-col gap-0.5">
        <AnimatePresence initial={false}>
          {chats.map((chat) => {
            const isConfirming = confirmDeleteId === chat.id

            return (
              <motion.div
                key={chat.id}
                layout
                exit={{
                  opacity: 0,
                  height: 0,
                  marginTop: 0,
                  marginBottom: 0,
                  overflow: "hidden",
                }}
                transition={{
                  layout: { duration: 0.25, ease: [0.25, 1, 0.5, 1] },
                  duration: 0.2,
                  ease: [0.25, 1, 0.5, 1],
                }}
              >
                <Link
                  to="/chat/$chatId"
                  params={{ chatId: chat.id }}
                  className="group flex items-center justify-between rounded-lg px-2 py-2 transition-colors hover:bg-tw-hover"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <TripwireLogo size={12} fill="#B4B4B4" />
                    <span className="truncate text-[13px] text-tw-text-secondary transition-colors group-hover:text-tw-text-primary">
                      {chat.title ?? "New chat"}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span className="text-[11px] text-tw-text-muted">
                      {formatRelativeTime(new Date(chat.updatedAt))}
                    </span>
                    {isConfirming ? (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            deleteChat.mutate({ chatId: chat.id })
                          }}
                          className="flex size-5 items-center justify-center rounded-md text-red-400 transition-all hover:bg-red-400/10 hover:text-red-300"
                        >
                          <SmallCheckStrokeIcon12 />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            setConfirmDeleteId(null)
                          }}
                          className="flex size-5 items-center justify-center rounded-md text-tw-text-muted transition-all hover:bg-[#FAFAFA10] hover:text-tw-text-secondary"
                        >
                          <StrokeXIcon10Muted />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          setConfirmDeleteId(chat.id)
                        }}
                        className="flex size-5 items-center justify-center rounded-md opacity-0 transition-all group-hover:opacity-100 hover:bg-[#FAFAFA10]"
                      >
                        <StrokeXIcon10Muted />
                      </button>
                    )}
                  </div>
                </Link>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Helper functions

function getEventTitle(action: string, severity: string | null): string {
  const titles: Record<string, string> = {
    pipeline_blocked: "Blocked",
    pipeline_allowed: "Allowed",
    rule_near_miss: "Near miss",
    blacklist_blocked: "Blacklisted user blocked",
    whitelist_bypass: "Whitelist bypass",
    pr_closed: "PR closed",
    issue_closed: "Issue closed",
    comment_deleted: "Comment deleted",
  }
  let title = titles[action] || "Event"
  if (severity === "error") title = `Blocked — ${title.toLowerCase()}`
  if (severity === "warning" && action !== "rule_near_miss")
    title = `Suspected spam`
  return title
}

function getEventAction(action: string): EventAction | null {
  const actions: Record<string, EventAction> = {
    pipeline_blocked: { label: "Review", kind: "review" },
    rule_near_miss: { label: "Review", kind: "review" },
    pr_closed: { label: "View PR", kind: "view" },
    issue_closed: { label: "Close issue", kind: "close" },
  }
  return actions[action] || null
}

interface IntegrationChipProps {
  fill: string
  kind: "figma" | "linear" | "github"
}

function IntegrationChip({ fill, kind }: IntegrationChipProps) {
  const label = kind === "figma" ? "F" : kind === "linear" ? "L" : "G"
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
      style={{
        width: 16,
        height: 16,
        marginRight: -8,
        boxShadow: "#313131 0px 0px 0px 2px",
        background: fill,
      }}
    >
      <span className="text-[9px] leading-none font-bold text-white">
        {label}
      </span>
    </span>
  )
}
