import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Dialog, DialogPopup, DialogTitle } from "@tripwire/ui/dialog"
import { Button } from "@tripwire/ui/button"
import { ScrollArea } from "@tripwire/ui/scroll-area"
import { useTRPC } from "#/integrations/trpc/react"
import { ScoreBadge } from "./score-badge"
import { ContributorAvatar } from "./contributor-avatar"
import { formatCompact, formatRelativeTime } from "#/lib/format"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "@tripwire/ui/toast"
import { githubRevalidationSignalKeys } from "#/lib/github/revalidation"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { patchOptimistic } from "#/lib/use-optimistic-mutation"
import {
  type ContributorAction,
  flipContributorStatuses,
  matchContributorsListForRepo,
  nextContributorStatus,
} from "#/components/layout/app/visibility/contributor-cache"
import type { ContributorRow } from "./contributors-table"

const actionToastTitle: Record<ContributorAction, (n: string) => string> = {
  whitelist: (n) => `Whitelisted @${n}`,
  blacklist: (n) => `Blocked @${n}`,
  removeWhitelist: (n) => `Removed @${n} from whitelist`,
  removeBlacklist: (n) => `Removed @${n} from blacklist`,
}

type DrawerAction = {
  action: ContributorAction
  label: string
  variant: "outline" | "secondary" | "destructive-outline"
}

function drawerActionsFor(status: ContributorRow["status"]): DrawerAction[] {
  const out: DrawerAction[] = []
  if (status === "whitelisted") {
    out.push({
      action: "removeWhitelist",
      label: "Remove from whitelist",
      variant: "outline",
    })
  }
  if (status === "blacklisted") {
    out.push({
      action: "removeBlacklist",
      label: "Remove from blacklist",
      variant: "outline",
    })
  }
  if (status !== "whitelisted") {
    out.push({ action: "whitelist", label: "Whitelist", variant: "secondary" })
  }
  if (status !== "blacklisted") {
    out.push({
      action: "blacklist",
      label: "Blacklist",
      variant: "destructive-outline",
    })
  }
  return out
}

interface ContributorDetailDrawerProps {
  repoId: string
  contributor: ContributorRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

const actionLabels: Record<string, string> = {
  pipeline_allowed: "Allowed",
  pipeline_blocked: "Blocked",
  pipeline_warned: "Warned",
  pipeline_logged: "Logged",
  rule_near_miss: "Near miss",
  whitelist_bypass: "Whitelist bypass",
  bot_bypass: "Bot bypass",
  blacklist_blocked: "Blacklist blocked",
  whitelist_added: "Added to whitelist",
  whitelist_removed: "Removed from whitelist",
  blacklist_added: "Added to blacklist",
  blacklist_removed: "Removed from blacklist",
  rule_config_updated: "Rule changed",
  score_reset: "Score reset",
}

const severityDot: Record<string, string> = {
  error: "bg-tw-error",
  warning: "bg-tw-warning",
  success: "bg-tw-success",
  info: "bg-tw-accent",
}

export function ContributorDetailDrawer({
  repoId,
  contributor,
  open,
  onOpenChange,
}: ContributorDetailDrawerProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const username = contributor?.githubUsername ?? ""

  // Persisted + signal-streamed: reopening the drawer renders last-known
  // events instantly while a fresh fetch runs. The `user:USERNAME` signal
  // invalidates within ~1s of a webhook for this contributor.
  const eventsQueryOpts = trpc.events.list.queryOptions(
    { repoId, targetUsername: username, limit: 30 },
    { enabled: !!contributor && open }
  )
  const eventsQuery = useQuery({
    ...eventsQueryOpts,
    meta: { persist: true },
  })
  const userSignalTargets = useMemo(
    () =>
      username
        ? [
            {
              queryKey: eventsQueryOpts.queryKey,
              signalKeys: [githubRevalidationSignalKeys.user({ username })],
            },
          ]
        : [],
    [username, eventsQueryOpts.queryKey]
  )
  useGitHubSignalStream(userSignalTargets)

  const contributorsListPrefix = trpc.visibility.listContributors.queryKey()
  const mutation = useMutation(
    trpc.visibility.bulkAction.mutationOptions({
      onMutate: (vars) =>
        patchOptimistic(
          queryClient,
          {
            predicate: matchContributorsListForRepo(
              contributorsListPrefix,
              vars.repoId
            ),
          },
          flipContributorStatuses(
            vars.usernames,
            nextContributorStatus(vars.action)
          )
        ),
      onError: (err, _vars, handle) => {
        handle?.rollback()
        toastFromError(err, { fallbackTitle: "Action failed" })
      },
      onSuccess: (_data, vars) => {
        toastManager.add({
          type: "success",
          title:
            actionToastTitle[vars.action]?.(vars.usernames[0] ?? "") ??
            "Updated",
        })
        onOpenChange(false)
      },
    })
  )

  if (!contributor) return null

  const stats = [
    {
      label: "Allowed",
      value: contributor.totalAllows,
      tone: "neutral" as const,
    },
    {
      label: "Blocked",
      value: contributor.totalBlocks,
      tone: "danger" as const,
    },
    {
      label: "Near miss",
      value: contributor.totalNearMisses,
      tone: "warn" as const,
    },
  ]

  const eventsData = eventsQuery.data

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-xl">
        <div className="flex items-start gap-3 px-5 pt-5 pb-3">
          <ContributorAvatar
            username={contributor.githubUsername}
            avatarUrl={contributor.avatarUrl}
            githubUserId={contributor.githubUserId}
            size="lg"
          />
          <div className="flex flex-1 flex-col gap-1">
            <DialogTitle>@{contributor.githubUsername}</DialogTitle>
            <div className="flex items-center gap-2">
              <ScoreBadge score={contributor.score} size="sm" />
              <span className="text-[11px] text-tw-text-muted">
                First seen {formatRelativeTime(contributor.firstSeenAt)} · last
                seen {formatRelativeTime(contributor.lastSeenAt)}
              </span>
            </div>
          </div>
        </div>

        <div className="px-5 pb-3">
          <div className="grid grid-cols-3 overflow-clip rounded-xl border border-tw-border bg-tw-inner">
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`flex flex-col gap-1 px-3 py-2.5 ${i < stats.length - 1 ? "border-r border-tw-border" : ""}`}
              >
                <span className="text-[10px] tracking-wide text-tw-text-muted uppercase">
                  {s.label}
                </span>
                <span
                  className={`text-[16px] font-semibold tabular-nums ${s.tone === "danger" ? "text-tw-error" : s.tone === "warn" ? "text-tw-warning" : "text-tw-text-primary"}`}
                >
                  {formatCompact(s.value)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-tw-border px-5 pt-3 pb-2">
          <span className="text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
            Recent activity
          </span>
        </div>
        <ScrollArea className="max-h-[280px] px-5">
          {eventsQuery.isLoading ? (
            <div className="py-4 text-[12px] text-tw-text-muted">Loading…</div>
          ) : (eventsData?.events.length ?? 0) === 0 ? (
            <div className="py-4 text-[12px] text-tw-text-muted">
              No events on this repo yet.
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 pb-3">
              {eventsData?.events.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start gap-2.5 rounded-lg bg-tw-inner/50 px-3 py-2"
                >
                  <span
                    className={`mt-1 size-1.5 shrink-0 rounded-full ${severityDot[e.severity ?? "info"] ?? "bg-tw-accent"}`}
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="text-[12px] text-tw-text-primary">
                      {actionLabels[e.action] ?? e.action}
                      {e.githubRef ? (
                        <span className="ml-1.5 text-tw-text-muted">
                          · {e.githubRef}
                        </span>
                      ) : null}
                    </span>
                    {e.description ? (
                      <span className="line-clamp-2 text-[11px] text-tw-text-muted">
                        {e.description}
                      </span>
                    ) : null}
                  </div>
                  <span className="shrink-0 text-[11px] text-tw-text-muted">
                    {formatRelativeTime(e.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>

        <div className="flex flex-wrap items-center justify-end gap-2 rounded-b-xl border-t border-tw-border bg-tw-bg/50 px-5 py-4">
          {drawerActionsFor(contributor.status).map((a) => (
            <Button
              key={a.action}
              variant={a.variant}
              size="sm"
              loading={mutation.isPending}
              onClick={() =>
                mutation.mutate({
                  repoId,
                  usernames: [username],
                  action: a.action,
                })
              }
            >
              {a.label}
            </Button>
          ))}
        </div>
      </DialogPopup>
    </Dialog>
  )
}
