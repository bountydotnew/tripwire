import { useEffect, useRef, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { Spinner } from "@tripwire/ui/spinner"
import {
  Dialog,
  DialogPopup,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "@tripwire/ui/dialog"
import { useTRPC } from "#/integrations/trpc/react"
import { invalidateRepoData } from "#/lib/cache"
import { formatCompact, formatRelativeTime } from "#/lib/format"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "@tripwire/ui/toast"

interface SyncBarProps {
  repoId: string
  repoFullName?: string
}

export function SyncBar({ repoId, repoFullName }: SyncBarProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const statusQuery = useQuery(
    trpc.visibility.syncStatus.queryOptions(
      { repoId },
      {
        refetchInterval: (q) => {
          const last = q.state.data?.lastRun
          return last?.status === "queued" || last?.status === "running"
            ? 5000
            : false
        },
      }
    )
  )

  const mutation = useMutation(
    trpc.visibility.requestSync.mutationOptions({
      onSuccess: (_data, vars) => {
        setConfirmOpen(false)
        invalidateRepoData(queryClient, vars.repoId)
        toastManager.add({ type: "success", title: "Sync started" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to start sync" }),
    })
  )

  const last = statusQuery.data?.lastRun
  const status = last?.status ?? "never"

  const prevStatusRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    const prev = prevStatusRef.current
    prevStatusRef.current = status
    if (prev && prev !== status && status === "completed") {
      invalidateRepoData(queryClient, repoId)
    }
  }, [status, queryClient, repoId])

  return (
    <div className="flex w-full flex-wrap items-center gap-3 rounded-2xl border border-tw-border bg-tw-card px-4 py-3">
      <SyncBarBody
        status={status}
        last={last}
        onSyncClick={() => setConfirmOpen(true)}
        onRetryClick={() => mutation.mutate({ repoId })}
        mutationPending={mutation.isPending}
      />

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogPopup className="max-w-md">
          <div className="flex flex-col gap-2 px-5 pt-5 pb-3">
            <DialogTitle>Sync repo history</DialogTitle>
            <DialogDescription className="text-[13px] text-tw-text-secondary">
              We&apos;ll pull every PR and issue from{" "}
              <span className="text-tw-text-primary">
                {repoFullName ?? "this repo"}
              </span>{" "}
              and backfill them into Visibility. This runs in the background
              and usually takes 1–5 minutes depending on repo size. You can
              close this tab — the sync continues server-side.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t border-tw-border bg-tw-bg/50 px-5 py-4">
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button
              variant="default"
              size="sm"
              loading={mutation.isPending}
              onClick={() => mutation.mutate({ repoId })}
            >
              Start sync
            </Button>
          </div>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

interface BodyProps {
  status: "never" | "queued" | "running" | "completed" | "errored"
  last: {
    status: string
    startedAt: Date | null
    completedAt: Date | null
    createdAt: Date
    stats: {
      prs: number
      issues: number
      contributors: number
      eventsInserted: number
    }
    errorMessage: string | null
  } | null | undefined
  onSyncClick: () => void
  onRetryClick: () => void
  mutationPending: boolean
}

function SyncBarBody({
  status,
  last,
  onSyncClick,
  onRetryClick,
  mutationPending,
}: BodyProps) {
  if (status === "never") {
    return (
      <>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-tw-text-primary">
            Sync repo history
          </span>
          <span className="text-[11px] text-tw-text-muted">
            Backfill PRs and issues from before Tripwire was installed.
          </span>
        </div>
        <Button
          variant="default"
          size="sm"
          onClick={onSyncClick}
          loading={mutationPending}
        >
          Sync repo history
        </Button>
      </>
    )
  }

  if (status === "queued" || status === "running") {
    const processed = (last?.stats.prs ?? 0) + (last?.stats.issues ?? 0)
    return (
      <>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2 text-[13px] font-medium text-tw-text-primary">
            <Spinner className="size-3.5 text-tw-text-secondary" />
            Syncing…
          </span>
          <span className="text-[11px] text-tw-text-muted">
            {processed > 0
              ? `${formatCompact(processed)} items processed`
              : "Fetching from GitHub…"}
          </span>
        </div>
      </>
    )
  }

  if (status === "errored") {
    return (
      <>
        <div className="flex flex-1 flex-col gap-0.5">
          <span className="text-[13px] font-medium text-tw-error">
            Sync failed
          </span>
          <span className="line-clamp-2 text-[11px] text-tw-text-muted">
            {last?.errorMessage ?? "Unknown error"}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRetryClick}
          loading={mutationPending}
        >
          Retry
        </Button>
      </>
    )
  }

  const completedAt = last?.completedAt ?? last?.createdAt
  const stats = last?.stats
  return (
    <>
      <div className="flex flex-1 flex-col gap-0.5">
        <span className="text-[13px] font-medium text-tw-text-primary">
          Last synced {formatRelativeTime(completedAt)}
        </span>
        <span className="text-[11px] text-tw-text-muted">
          {stats
            ? `${formatCompact(stats.eventsInserted)} events · ${formatCompact(stats.contributors)} contributors`
            : "Historical data is up to date."}
        </span>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRetryClick}
        loading={mutationPending}
        className="text-tw-text-muted hover:text-tw-text-primary"
      >
        Re-sync
      </Button>
    </>
  )
}
