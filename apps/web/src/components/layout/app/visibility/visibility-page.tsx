import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { toastManager } from "@tripwire/ui/toast"
import { EmptyState } from "#/components/shared/empty-state"
import {
  ContributorsTable,
  type SortColumn,
} from "#/components/layout/app/visibility/contributors-table"
import { ContributorDetailDrawer } from "#/components/layout/app/visibility/contributor-detail-drawer"
import {
  RiskAlertsPanel,
  SuggestedWhitelistPanel,
} from "#/components/layout/app/visibility/recommendation-panels"
import { RepoActivityFeed } from "#/components/layout/app/visibility/repo-activity-feed"
import { SyncBar } from "#/components/layout/app/visibility/sync-bar"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"
import { formatCompact } from "#/lib/format"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import { routes } from "#/lib/routes"
import { toastFromError } from "#/lib/toast-error"
import { patchOptimistic } from "#/lib/use-optimistic-mutation"
import {
  flipContributorStatuses,
  matchContributorsListForRepo,
  nextContributorStatus,
} from "#/components/layout/app/visibility/contributor-cache"

type StatusFilter = "all" | "whitelisted" | "blacklisted" | "normal"

export function VisibilityPageSkeleton() {
  return (
    <div className="flex flex-col items-center px-4 py-6 md:px-[120px] md:py-8">
      <div className="mt-3 mb-6 flex w-full flex-col gap-2 md:mt-5 md:mb-11">
        <div className="h-7 w-32 rounded bg-white/5" />
        <div className="h-5 w-72 rounded bg-white/5" />
      </div>
      <div className="flex w-full flex-col gap-3">
        <div className="flex w-full flex-col gap-3 md:flex-row">
          <div className="h-48 flex-1 rounded-2xl bg-white/5" />
          <div className="h-48 flex-1 rounded-2xl bg-white/5" />
        </div>
        <div className="h-12 w-full rounded-xl bg-white/5" />
        <div className="h-96 w-full rounded-2xl bg-white/5" />
      </div>
    </div>
  )
}

export function VisibilityPage() {
  const { repo, repos, isLoading } = useWorkspace()
  const repoId = repo?.id
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all")
  const [sort, setSort] = useState<SortColumn>("score")
  const [dir, setDir] = useState<"asc" | "desc">("desc")
  const [selection, setSelection] = useState<Record<string, boolean>>({})
  const [activeUsername, setActiveUsername] = useState<string | null>(null)

  const listQueryOpts = trpc.visibility.listContributors.queryOptions(
    {
      repoId: repoId ?? "",
      search: search || undefined,
      sort,
      dir,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
      offset: 0,
    },
    { enabled: !!repoId, staleTime: 30_000 }
  )
  const listQuery = useQuery({
    ...listQueryOpts,
    meta: { persist: true },
  })
  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName, [listQueryOpts.queryKey])
  )

  const contributorsListPrefix = trpc.visibility.listContributors.queryKey()
  const bulkMutation = useMutation(
    trpc.visibility.bulkAction.mutationOptions({
      // Optimistic patch: flip status on every cached `listContributors`
      // variant for this repo. The signal stream brings canonical data
      // when the durable-factory pipeline catches up — no invalidate.
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
        toastFromError(err, { fallbackTitle: "Bulk action failed" })
      },
      onSuccess: (data, vars) => {
        setSelection({})
        const verb = vars.action === "whitelist" ? "Whitelisted" : "Blacklisted"
        toastManager.add({
          type: "success",
          title: `${verb} ${data.count} contributor${data.count === 1 ? "" : "s"}`,
        })
      },
    })
  )

  const rows = listQuery.data?.items ?? []
  const total = listQuery.data?.total ?? 0
  const selectedUsernames = useMemo(
    () =>
      Object.entries(selection)
        .filter(([, v]) => v)
        .map(([k]) => k),
    [selection]
  )
  const selectedCount = selectedUsernames.length

  const activeContributor = useMemo(
    () => rows.find((r) => r.githubUsername === activeUsername) ?? null,
    [rows, activeUsername]
  )

  if (!isLoading && repos.length === 0) {
    return (
      <EmptyState
        title="Install the Tripwire GitHub App"
        description="Connect your GitHub repositories to start seeing who's interacting with them."
        action={{
          label: "Install GitHub App",
          href: routes.api.githubInstall,
        }}
      />
    )
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 md:px-[120px] md:py-8">
      <div className="mt-3 mb-6 flex w-full flex-col gap-2 md:mt-5 md:mb-11">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          Visibility
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          Contributors, scores, and whitelist controls for{" "}
          {repo?.fullName ? (
            <span className="text-tw-text-primary">{repo.fullName}</span>
          ) : (
            "your repo"
          )}
          .
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        {repoId ? (
          <>
            <SyncBar repoId={repoId} repoFullName={repo?.fullName} />
            <div className="flex w-full flex-col gap-3 md:flex-row">
              <SuggestedWhitelistPanel
                repoId={repoId}
                onSelect={setActiveUsername}
              />
              <RiskAlertsPanel repoId={repoId} onSelect={setActiveUsername} />
            </div>
            <RepoActivityFeed repoId={repoId} repoFullName={repo?.fullName} />
          </>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-tw-border bg-tw-card px-3 py-2">
          <input
            type="search"
            aria-label="Search contributors by username"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by username"
            className="h-8 min-w-[180px] flex-1 rounded-md border border-tw-border bg-tw-inner px-2.5 text-[13px] text-tw-text-primary placeholder:text-tw-text-muted focus:border-tw-text-tertiary focus:outline-none"
          />
          <StatusToggle value={statusFilter} onChange={setStatusFilter} />
          <span className="ml-auto text-[12px] text-tw-text-muted tabular-nums">
            {formatCompact(total)} contributors
          </span>
        </div>

        {selectedCount > 0 && repoId ? (
          <div className="flex items-center gap-2 rounded-xl border border-tw-accent/20 bg-tw-accent/5 px-3 py-2">
            <span className="text-[12px] text-tw-text-primary">
              {selectedCount} selected
            </span>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSelection({})}
              className="text-tw-text-muted"
            >
              Clear
            </Button>
            <span className="ml-auto" />
            <Button
              variant="secondary"
              size="sm"
              loading={bulkMutation.isPending}
              onClick={() =>
                bulkMutation.mutate({
                  repoId,
                  usernames: selectedUsernames,
                  action: "whitelist",
                })
              }
            >
              Whitelist {selectedCount}
            </Button>
            <Button
              variant="destructive-outline"
              size="sm"
              loading={bulkMutation.isPending}
              onClick={() =>
                bulkMutation.mutate({
                  repoId,
                  usernames: selectedUsernames,
                  action: "blacklist",
                })
              }
            >
              Blacklist {selectedCount}
            </Button>
          </div>
        ) : null}

        <ContributorsTable
          rows={rows}
          sort={sort}
          dir={dir}
          onSortChange={(s, d) => {
            setSort(s)
            setDir(d)
          }}
          onRowClick={setActiveUsername}
          selection={selection}
          onSelectionChange={setSelection}
          isLoading={listQuery.isLoading}
        />
      </div>

      {repoId ? (
        <ContributorDetailDrawer
          repoId={repoId}
          contributor={activeContributor}
          open={!!activeContributor}
          onOpenChange={(open) => !open && setActiveUsername(null)}
        />
      ) : null}
    </div>
  )
}

function StatusToggle({
  value,
  onChange,
}: {
  value: StatusFilter
  onChange: (v: StatusFilter) => void
}) {
  const options: { label: string; value: StatusFilter }[] = [
    { label: "All", value: "all" },
    { label: "Normal", value: "normal" },
    { label: "Whitelisted", value: "whitelisted" },
    { label: "Blacklisted", value: "blacklisted" },
  ]
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-tw-border bg-tw-inner p-0.5">
      {options.map((o) => (
        <Button
          key={o.value}
          variant="ghost"
          size="xs"
          onClick={() => onChange(o.value)}
          className={`h-6 rounded-[5px] border-transparent px-2 text-[12px] font-medium ${
            value === o.value
              ? "bg-tw-card text-tw-text-primary"
              : "text-tw-text-muted hover:text-tw-text-secondary"
          }`}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
