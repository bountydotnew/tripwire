import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@tripwire/ui/menu"
import { toastManager } from "@tripwire/ui/toast"
import { GitHubMarkWhiteIcon20 } from "@tripwire/ui/icons/github-mark-icon"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import type { RouterOutputs } from "#/integrations/trpc/router"
import { useTRPC } from "#/integrations/trpc/react"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import { getContentTypeLabel } from "#/lib/event-labels"
import { formatRelativeTime } from "#/lib/format"
import { severityDotColor } from "#/lib/severity-design"
import { toastFromError } from "#/lib/toast-error"
import { useWorkspace } from "#/providers/workspace-context"

type QueueItem = RouterOutputs["moderation"]["listQueue"]["items"][number]

type ResolveAction =
  | "allow"
  | "dismiss"
  | "snooze"
  | "remove"
  | "whitelist"
  | "blacklist"
  | "watch"

const SOURCE_LABEL: Record<QueueItem["source"], string | null> = {
  rule_flag: null,
  report: "Report",
  new_contributor: "New",
}

export function ReviewQueue({ repoId }: { repoId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repo } = useWorkspace()

  const queueOpts = trpc.moderation.listQueue.queryOptions({ repoId })
  const query = useQuery({
    ...queueOpts,
    placeholderData: keepPreviousData,
    meta: { persist: true },
  })

  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName, [queueOpts.queryKey])
  )

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: queueOpts.queryKey })
    void queryClient.invalidateQueries({
      queryKey: trpc.moderation.pendingCount.queryKey({ repoId }),
    })
    void queryClient.invalidateQueries({
      queryKey: trpc.whitelist.list.queryKey({ repoId }),
    })
    void queryClient.invalidateQueries({
      queryKey: trpc.blacklist.list.queryKey({ repoId }),
    })
  }

  const resolve = useMutation(
    trpc.moderation.resolveItem.mutationOptions({
      onSuccess: invalidate,
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to update item" }),
    })
  )

  const backfill = useMutation(
    trpc.moderation.backfill.mutationOptions({
      onSuccess: (data) => {
        invalidate()
        toastManager.add({
          type: data.inserted > 0 ? "success" : "info",
          title:
            data.inserted > 0
              ? `Loaded ${data.inserted} item${data.inserted === 1 ? "" : "s"}`
              : "Nothing new to load",
        })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Backfill failed" }),
    })
  )

  const items = (query.data?.items ?? []) as QueueItem[]

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[13px] font-[520] tracking-[-0.2px] text-tw-text-primary">
          Review queue
        </span>
        {items.length > 0 && (
          <span className="text-[11px] text-tw-text-muted tabular-nums">
            {items.length} open
          </span>
        )}
      </div>

      <div className="rounded-2xl bg-tw-card p-1.5">
        {query.isLoading ? (
          <QueueMessage>Loading…</QueueMessage>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="m-0 text-[13px] text-tw-text-muted">
              Nothing in the queue — flagged content, reports, and new
              contributors land here.
            </p>
            <Button
              variant="outline"
              size="sm"
              loading={backfill.isPending}
              onClick={() => backfill.mutate({ repoId })}
            >
              Load from recent activity
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {items.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                pending={
                  resolve.isPending && resolve.variables?.itemId === item.id
                }
                onAction={(action) =>
                  resolve.mutate({ itemId: item.id, action })
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function QueueMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center text-[12px] text-tw-text-muted">
      {children}
    </div>
  )
}

function QueueRow({
  item,
  pending,
  onAction,
}: {
  item: QueueItem
  pending: boolean
  onAction: (action: ResolveAction) => void
}) {
  const username = item.targetGithubUsername
  const sourceLabel = SOURCE_LABEL[item.source]
  const isContent = item.subject === "content"

  return (
    <div className="flex items-center gap-3 rounded-xl bg-tw-inner px-3 py-2.5">
      <span
        className={`size-2 shrink-0 rounded-full ${severityDotColor(item.severity)}`}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-1.5">
          {isContent ? (
            <GitHubMarkWhiteIcon20 className="h-3.5 w-3.5 shrink-0 opacity-80" />
          ) : (
            <TripwireLogo size={13} className="shrink-0 text-tw-text-muted" />
          )}
          <span className="truncate text-[13px] font-medium text-tw-text-primary">
            {item.title}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-tw-text-muted">
          {sourceLabel && (
            <span className="rounded bg-white/5 px-1.5 py-0.5 font-medium">
              {sourceLabel}
            </span>
          )}
          {username && <span>@{username}</span>}
          {item.contentType && (
            <span>· {getContentTypeLabel(item.contentType)}</span>
          )}
          <span>· {formatRelativeTime(item.createdAt)}</span>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isContent ? (
          <>
            <Button
              variant="secondary"
              size="xs"
              loading={pending}
              onClick={() => onAction("allow")}
            >
              Allow
            </Button>
            <Button
              variant="destructive-outline"
              size="xs"
              disabled={pending}
              onClick={() => onAction("remove")}
            >
              Remove
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="secondary"
              size="xs"
              disabled={!username}
              onClick={() => onAction("whitelist")}
            >
              Approve
            </Button>
            <Button
              variant="destructive-outline"
              size="xs"
              disabled={!username}
              onClick={() => onAction("blacklist")}
            >
              Ban
            </Button>
          </>
        )}

        <Menu>
          <MenuTrigger className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-tw-text-muted transition-colors hover:bg-tw-hover hover:text-tw-text-primary">
            <span className="text-[15px] leading-none">⋯</span>
          </MenuTrigger>
          <MenuPopup align="end">
            {isContent && username && (
              <>
                <MenuItem onClick={() => onAction("whitelist")}>
                  Whitelist @{username}
                </MenuItem>
                <MenuItem
                  variant="destructive"
                  onClick={() => onAction("blacklist")}
                >
                  Ban @{username}
                </MenuItem>
              </>
            )}
            {username && (
              <MenuItem onClick={() => onAction("watch")}>
                Watch @{username}
              </MenuItem>
            )}
            <MenuSeparator />
            <MenuItem onClick={() => onAction("snooze")}>Snooze 1 day</MenuItem>
            <MenuItem onClick={() => onAction("dismiss")}>Dismiss</MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  )
}
