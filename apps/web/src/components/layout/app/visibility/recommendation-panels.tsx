import { useMemo } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { ScoreBadge } from "./score-badge"
import { ContributorAvatar } from "./contributor-avatar"
import { formatRelativeTime } from "#/lib/format"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "@tripwire/ui/toast"
import { useWorkspace } from "#/providers/workspace-context"
import { githubRevalidationSignalKeys } from "#/lib/github/revalidation"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"

/**
 * Build the targets array for both recommendation queries on this repo.
 * Shared between SuggestedWhitelist and RiskAlerts since they consume
 * the same signal (any webhook for the repo updates scoring inputs).
 */
function useRepoSignalTargets(
  repoFullName: string | null,
  queryKey: readonly unknown[],
) {
  return useMemo(() => {
    if (!repoFullName) return []
    const [owner, name] = repoFullName.split("/")
    if (!owner || !name) return []
    return [
      {
        queryKey,
        signalKeys: [githubRevalidationSignalKeys.repo({ owner, repo: name })],
      },
    ]
  }, [repoFullName, queryKey])
}

interface PanelProps {
  repoId: string
  onSelect: (username: string) => void
}

interface SuggestedRow {
  githubUsername: string
  githubUserId: number | null
}

/**
 * Defense-in-depth filter for "is this row the viewing user?".
 * Server already excludes by id + username, but client repeats the check so
 * any stale cache or upstream regression can't leak the viewer into the list.
 */
function isSelf<T extends SuggestedRow>(
  row: T,
  selfGithubId: number | null
): boolean {
  return selfGithubId != null && row.githubUserId === selfGithubId
}

export function SuggestedWhitelistPanel({ repoId, onSelect }: PanelProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repo } = useWorkspace()
  const meQuery = useQuery(trpc.auth.me.queryOptions())
  const selfGithubId = meQuery.data?.githubId ?? null
  const queryOpts = trpc.visibility.suggestedWhitelist.queryOptions({
    repoId,
    limit: 6,
  })
  const query = useQuery({ ...queryOpts, meta: { persist: true } })
  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName ?? null, queryOpts.queryKey),
  )
  const rows = useMemo(
    () => (query.data ?? []).filter((c) => !isSelf(c, selfGithubId)),
    [query.data, selfGithubId]
  )
  const mutation = useMutation(
    trpc.visibility.bulkAction.mutationOptions({
      // Optimistically remove the row from THIS panel's list — whitelisted
      // contributors no longer belong in "suggested whitelist."
      onMutate: (vars) => {
        const target = vars.usernames[0]?.toLowerCase()
        if (!target) return { previous: undefined }
        const previous = queryClient.getQueryData(queryOpts.queryKey)
        queryClient.setQueryData(queryOpts.queryKey, (current) =>
          current
            ? current.filter(
                (row) => row.githubUsername.toLowerCase() !== target,
              )
            : current,
        )
        return { previous }
      },
      onError: (err, _vars, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData(
            queryOpts.queryKey,
            context.previous as never,
          )
        }
        toastFromError(err, { fallbackTitle: "Failed to whitelist" })
      },
      onSuccess: (_data, vars) => {
        // Skip invalidate — signal stream brings canonical data when
        // the score-user job propagates server-side. See visibility.tsx
        // bulkMutation for the full rationale.
        toastManager.add({
          type: "success",
          title: `Whitelisted @${vars.usernames[0]}`,
        })
      },
    }),
  )

  return (
    <PanelShell
      title="Suggested whitelist"
      hint="High-score contributors not yet on either list."
      isLoading={query.isLoading}
      isEmpty={!query.isLoading && rows.length === 0}
      emptyLabel="No suggestions right now — nice and quiet."
    >
      {rows.map((c) => (
        <PanelRow
          key={c.githubUsername}
          username={c.githubUsername}
          githubUserId={c.githubUserId}
          score={c.score}
          subtitle={`${c.totalAllows} allowed · last seen ${formatRelativeTime(c.lastSeenAt)}`}
          actionLabel="Whitelist"
          actionTone="positive"
          loading={
            mutation.isPending &&
            mutation.variables?.usernames.includes(c.githubUsername)
          }
          onAction={() =>
            mutation.mutate({
              repoId,
              usernames: [c.githubUsername],
              action: "whitelist",
            })
          }
          onSelect={() => onSelect(c.githubUsername)}
        />
      ))}
    </PanelShell>
  )
}

export function RiskAlertsPanel({ repoId, onSelect }: PanelProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repo } = useWorkspace()
  const meQuery = useQuery(trpc.auth.me.queryOptions())
  const selfGithubId = meQuery.data?.githubId ?? null
  const queryOpts = trpc.visibility.riskAlerts.queryOptions({
    repoId,
    limit: 6,
  })
  const query = useQuery({ ...queryOpts, meta: { persist: true } })
  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName ?? null, queryOpts.queryKey),
  )
  const rows = useMemo(
    () => (query.data ?? []).filter((c) => !isSelf(c, selfGithubId)),
    [query.data, selfGithubId]
  )
  const mutation = useMutation(
    trpc.visibility.bulkAction.mutationOptions({
      // Mirror of the suggested-whitelist panel: blocking a row should
      // remove it from the risk-alerts list immediately.
      onMutate: (vars) => {
        const target = vars.usernames[0]?.toLowerCase()
        if (!target) return { previous: undefined }
        const previous = queryClient.getQueryData(queryOpts.queryKey)
        queryClient.setQueryData(queryOpts.queryKey, (current) =>
          current
            ? current.filter(
                (row) => row.githubUsername.toLowerCase() !== target,
              )
            : current,
        )
        return { previous }
      },
      onError: (err, _vars, context) => {
        if (context?.previous !== undefined) {
          queryClient.setQueryData(
            queryOpts.queryKey,
            context.previous as never,
          )
        }
        toastFromError(err, { fallbackTitle: "Failed to block" })
      },
      onSuccess: (_data, vars) => {
        toastManager.add({
          type: "success",
          title: `Blocked @${vars.usernames[0]}`,
        })
      },
    }),
  )

  return (
    <PanelShell
      title="Risk alerts"
      hint="Low-score contributors with activity in the last 14 days."
      isLoading={query.isLoading}
      isEmpty={!query.isLoading && rows.length === 0}
      emptyLabel="No recent risky activity."
    >
      {rows.map((c) => (
        <PanelRow
          key={c.githubUsername}
          username={c.githubUsername}
          githubUserId={c.githubUserId}
          score={c.score}
          subtitle={`${c.totalBlocks} blocked · last seen ${formatRelativeTime(c.lastSeenAt)}`}
          actionLabel="Block"
          actionTone="destructive"
          loading={
            mutation.isPending &&
            mutation.variables?.usernames.includes(c.githubUsername)
          }
          onAction={() =>
            mutation.mutate({
              repoId,
              usernames: [c.githubUsername],
              action: "blacklist",
            })
          }
          onSelect={() => onSelect(c.githubUsername)}
        />
      ))}
    </PanelShell>
  )
}

function PanelShell({
  title,
  hint,
  isLoading,
  isEmpty,
  emptyLabel,
  children,
}: {
  title: string
  hint: string
  isLoading?: boolean
  isEmpty?: boolean
  emptyLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-[200px] flex-1 flex-col overflow-clip rounded-2xl border border-tw-border bg-tw-card">
      <div className="flex flex-col gap-1 border-b border-tw-border px-4 py-3">
        <span className="text-[13px] font-[520] tracking-[-0.2px] text-tw-text-primary">
          {title}
        </span>
        <span className="text-[11px] text-tw-text-muted">{hint}</span>
      </div>
      <div className="flex flex-1 flex-col">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-[12px] text-tw-text-muted">
            Loading…
          </div>
        ) : isEmpty ? (
          <div className="flex flex-1 items-center justify-center px-4 py-8 text-[12px] text-tw-text-muted">
            {emptyLabel}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  )
}

function PanelRow({
  username,
  githubUserId,
  score,
  subtitle,
  actionLabel,
  actionTone,
  loading,
  onAction,
  onSelect,
}: {
  username: string
  githubUserId: number | null
  score: number
  subtitle: string
  actionLabel: string
  actionTone: "positive" | "destructive"
  loading: boolean
  onAction: () => void
  onSelect: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-b border-tw-border/50 px-4 py-2.5 last:border-b-0 hover:bg-tw-hover">
      <Button
        variant="ghost"
        onClick={onSelect}
        className="-mx-2 flex h-auto flex-1 items-center justify-start gap-2.5 px-2 py-0 text-left"
      >
        <ContributorAvatar
          username={username}
          githubUserId={githubUserId}
          size="sm"
        />
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px] font-medium text-tw-text-primary">
            @{username}
          </span>
          <span className="truncate text-[11px] text-tw-text-muted">
            {subtitle}
          </span>
        </div>
      </Button>
      <ScoreBadge score={score} size="sm" />
      <Button
        variant={actionTone === "positive" ? "secondary" : "destructive-outline"}
        size="xs"
        loading={loading}
        onClick={onAction}
      >
        {actionLabel}
      </Button>
    </div>
  )
}

