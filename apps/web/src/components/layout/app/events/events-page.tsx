import { Link } from "@tanstack/react-router"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { useEffect, useState } from "react"
import { Button } from "@tripwire/ui/button"
import { ChevronRightIndicatorIcon12 } from "@tripwire/ui/icons/app-chrome-icons"
import { RULE_META } from "@tripwire/db/schema/rule-meta"
import type { EventAction } from "@tripwire/db"
import { EmptyState } from "#/components/shared/empty-state"
import { getEventActionLabel } from "#/lib/event-labels"
import { markEventsViewed } from "#/hooks/use-events-unread"
import { isCustomRuleName, stripCustomRulePrefix } from "#/lib/custom-rules"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import { routes } from "#/lib/routes"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"

type Event = {
  id: string
  repoId: string
  action: string
  severity: string | null
  description: string | null
  contentType: string | null
  pipelineId: string | null
  ruleName: string | null
  targetGithubUsername: string | null
  targetGithubUserId: number | null
  githubRef: string | null
  metadata: Record<string, unknown> | null
  createdAt: string | Date
}

const SEVERITY_DOT: Record<string, string> = {
  success: "bg-tw-success",
  error: "bg-tw-error",
  warning: "bg-tw-warning",
  info: "bg-tw-accent",
}

type FilterAction = EventAction

type FilterState = {
  action: FilterAction | null
  username: string
}

const RULE_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.entries(RULE_META).map(([k, v]) => [k, v.name])),
  blacklist: "Blacklist",
  requireProfilePicture: "Profile Picture", // legacy
}

const CONTENT_TYPE_LABELS: Record<string, string> = {
  pull_request: "PR",
  issue: "Issue",
  comment: "Comment",
}

function timeAgo(dateStr: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

// Events that don't have useful detail pages
const NON_CLICKABLE_ACTIONS = new Set([
  "rule_config_updated",
  "whitelist_added",
  "whitelist_removed",
  "blacklist_added",
  "blacklist_removed",
])

function EventRow({ event, orgSlug }: { event: Event; orgSlug: string }) {
  const dotColor = SEVERITY_DOT[event.severity ?? "info"] ?? SEVERITY_DOT.info
  const actionLabel = getEventActionLabel(event.action)
  const isClickable = !NON_CLICKABLE_ACTIONS.has(event.action)

  const content = (
    <>
      {/* Severity dot */}
      <span className={`size-2 shrink-0 rounded-full ${dotColor}`} />

      {/* Description */}
      <span className="min-w-0 flex-1 truncate text-[13px] leading-4 font-medium tracking-[-0.2px] text-white">
        {event.description || actionLabel}
      </span>

      {/* Tags */}
      <div className="flex shrink-0 items-center gap-1.5">
        {event.ruleName && isCustomRuleName(event.ruleName) && (
          <>
            <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[11px] leading-none font-medium text-purple-300">
              Custom
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] leading-none font-medium text-[#FFFFFF73]">
              {stripCustomRulePrefix(event.ruleName)}
            </span>
          </>
        )}
        {event.ruleName && !isCustomRuleName(event.ruleName) && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] leading-none font-medium text-[#FFFFFF73]">
            {RULE_NAMES[event.ruleName] ?? event.ruleName}
          </span>
        )}
        {event.contentType && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] leading-none font-medium text-[#FFFFFF73]">
            {CONTENT_TYPE_LABELS[event.contentType] ?? event.contentType}
          </span>
        )}
        {event.githubRef && (
          <span className="font-mono text-[11px] leading-none text-[#FFFFFF73]">
            {event.githubRef}
          </span>
        )}
      </div>

      {/* Username */}
      {event.targetGithubUsername && (
        <div className="flex shrink-0 items-center gap-1.5">
          <img
            src={`https://github.com/${event.targetGithubUsername}.png?size=32`}
            alt=""
            className="size-4 rounded-full"
          />
          <span className="text-[12px] font-medium text-[#FFFFFF73]">
            {event.targetGithubUsername}
          </span>
        </div>
      )}

      {/* Timestamp */}
      <span className="w-14 shrink-0 text-right text-[12px] text-[#FFFFFF59] tabular-nums">
        {timeAgo(event.createdAt)}
      </span>

      {/* Arrow indicator - only show for clickable rows */}
      {isClickable && (
        <ChevronRightIndicatorIcon12 className="shrink-0 text-[#FFFFFF59]" />
      )}
    </>
  )

  if (!isClickable) {
    return (
      <div className="flex w-full items-center gap-3 px-4 py-2.5">
        {content}
      </div>
    )
  }

  return (
    <Link
      to="/$orgHandle/events/$eventId"
      params={{ orgHandle: orgSlug, eventId: event.id }}
      className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-white/[0.02]"
    >
      {content}
    </Link>
  )
}

function FilterTab({
  label,
  active,
  count,
  onClick,
}: {
  label: string
  active: boolean
  count?: number
  onClick: () => void
}) {
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border-none px-2.5 py-1 text-[13px] font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "bg-transparent text-[#FFFFFF59] hover:text-[#FFFFFF73]"
      } `}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span className="text-[11px] text-[#FFFFFF59] tabular-nums">
          {count}
        </span>
      )}
    </Button>
  )
}

function EventListSkeleton() {
  return (
    <div className="divide-y divide-white/[0.03]">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <div className="size-2 rounded-full bg-white/5" />
          <div className="h-3.5 flex-1 rounded bg-white/5" />
          <div className="h-3.5 w-12 rounded bg-white/5" />
        </div>
      ))}
    </div>
  )
}

export function EventsPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
      {/* Header */}
      <div className="flex flex-col gap-0.5">
        <div className="h-7 w-20 rounded bg-white/5" />
        <div className="h-4 w-56 rounded bg-white/5" />
      </div>

      {/* Stats bar */}
      <div className="flex flex-wrap overflow-clip rounded-xl border border-[#0000000F] bg-tw-card shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
        {Array.from({ length: 4 }).map((_, i, arr) => (
          <div
            key={i}
            className={`flex min-w-0 grow flex-col px-3 pt-2.5 pb-2 md:px-4 ${i < arr.length - 1 ? "md:border-r md:border-r-[#0000000F]" : ""}`}
          >
            <div className="mb-1.5 h-3.5 w-16 rounded bg-white/5" />
            <div className="h-6 w-10 rounded bg-white/5" />
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 w-16 rounded-lg bg-white/5" />
        ))}
      </div>

      {/* Event list */}
      <div className="overflow-hidden rounded-xl border border-tw-border bg-tw-card">
        <EventListSkeleton />
      </div>
    </div>
  )
}

export function EventsPage() {
  const { org, repo, repos, isLoading } = useWorkspace()
  const repoId = repo?.id
  const trpc = useTRPC()

  useEffect(() => {
    markEventsViewed(repoId)
  }, [repoId])

  const [filters, setFilters] = useState<FilterState>({
    action: null,
    username: "",
  })

  const [page, setPage] = useState(0)
  const limit = 50

  const queryInput = {
    repoId: repoId!,
    limit,
    offset: page * limit,
    actions: filters.action ? [filters.action] : undefined,
    targetUsername: filters.username || undefined,
  }

  const eventsQueryOpts = trpc.events.list.queryOptions(queryInput)
  const severityQueryOpts = trpc.events.severityCounts.queryOptions({
    repoId: repoId!,
    days: 30,
  })
  const countsQueryOpts = trpc.events.countsByAction.queryOptions({
    repoId: repoId!,
    days: 30,
  })

  const eventsQuery = useQuery({
    ...eventsQueryOpts,
    enabled: !!repoId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
    meta: { persist: true },
  })

  // Stats query is independent of tab/filter state — never re-fetches on tab switch
  const severityQuery = useQuery({
    ...severityQueryOpts,
    enabled: !!repoId,
    staleTime: 60_000,
    meta: { persist: true },
  })

  // Tab counts query
  const countsQuery = useQuery({
    ...countsQueryOpts,
    enabled: !!repoId,
    staleTime: 60_000,
    meta: { persist: true },
  })

  // Repo-wide signal subscription — any webhook for this repo invalidates
  // all three queries within ~1s. Replaces the previous 30s refetchInterval.
  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName, [
      eventsQueryOpts.queryKey,
      severityQueryOpts.queryKey,
      countsQueryOpts.queryKey,
    ])
  )

  const events = (eventsQuery.data?.events ?? []) as unknown as Event[]
  const total = eventsQuery.data?.total ?? 0
  const severityCounts = severityQuery.data ?? {}
  const actionCounts = countsQuery.data
  const isInitialLoad =
    isLoading || (!eventsQuery.data && eventsQuery.isLoading)
  const isFilterFetching = eventsQuery.isFetching && !isInitialLoad

  const hasFilters = filters.action || filters.username

  // Show empty state if no repos
  if (!isLoading && repos.length === 0) {
    return (
      <EmptyState
        title="Install the Tripwire GitHub App"
        description="Connect your GitHub repositories to start tracking activity."
        action={{
          label: "Install GitHub App",
          href: routes.api.githubInstall,
        }}
      />
    )
  }

  // Full skeleton only on very first load (no data at all yet)
  if (isInitialLoad) {
    return <EventsPageSkeleton />
  }

  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
      {/* Header */}
      <div className="flex w-full items-start justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="m-0 text-xl leading-[30px] font-medium tracking-[-0.02em] text-white md:text-2xl">
            Events
          </h1>
          <p className="m-0 text-sm leading-[18px] text-[#FFFFFF73]">
            Real-time activity feed
          </p>
        </div>
      </div>

      {/* Summary counters */}
      <div className="flex flex-wrap overflow-clip rounded-xl border border-[#0000000F] bg-tw-card shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
        {[
          { key: "success", label: "Allowed", dot: "bg-tw-success" },
          { key: "error", label: "Blocked", dot: "bg-tw-error" },
          { key: "warning", label: "Near Misses", dot: "bg-tw-warning" },
          {
            key: "workflow",
            label: "Workflows",
            dot: "bg-[#34A6FF]",
            count: actionCounts?.workflow_run,
          },
          { key: "info", label: "Other", dot: "bg-tw-accent" },
        ].map((item, i, arr) => (
          <div
            key={item.key}
            className={`flex min-w-0 grow flex-col px-3 pt-2.5 pb-2 md:px-4 ${i < arr.length - 1 ? "md:border-r md:border-r-[#0000000F]" : ""}`}
          >
            <div className="mb-1 flex items-center gap-1.5">
              <span className={`size-1.5 rounded-full ${item.dot}`} />
              <span className="text-[13px] leading-4 font-[520] tracking-[-0.2px] text-[#FFFFFF73]">
                {item.label}
              </span>
            </div>
            <span className="text-xl leading-7 font-semibold text-[#FFFFFFCC] tabular-nums">
              {("count" in item && item.count !== undefined
                ? item.count
                : (severityCounts[item.key] ?? 0)
              ).toLocaleString()}
            </span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-1">
        <FilterTab
          label="All"
          active={!filters.action}
          count={actionCounts?.total}
          onClick={() => setFilters((f) => ({ ...f, action: null }))}
        />
        <FilterTab
          label="Blocked"
          active={filters.action === "pipeline_blocked"}
          count={actionCounts?.pipeline_blocked}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              action:
                f.action === "pipeline_blocked" ? null : "pipeline_blocked",
            }))
          }
        />
        <FilterTab
          label="Allowed"
          active={filters.action === "pipeline_allowed"}
          count={actionCounts?.pipeline_allowed}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              action:
                f.action === "pipeline_allowed" ? null : "pipeline_allowed",
            }))
          }
        />
        <FilterTab
          label="Near Misses"
          active={filters.action === "rule_near_miss"}
          count={actionCounts?.rule_near_miss}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              action: f.action === "rule_near_miss" ? null : "rule_near_miss",
            }))
          }
        />
        <FilterTab
          label="Workflows"
          active={filters.action === "workflow_run"}
          count={actionCounts?.workflow_run}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              action: f.action === "workflow_run" ? null : "workflow_run",
            }))
          }
        />
        <FilterTab
          label="Config"
          active={filters.action === "rule_config_updated"}
          count={actionCounts?.rule_config_updated}
          onClick={() =>
            setFilters((f) => ({
              ...f,
              action:
                f.action === "rule_config_updated"
                  ? null
                  : "rule_config_updated",
            }))
          }
        />

        {/* Spacer */}
        <div className="flex-1" />

        {/* Username filter */}
        <input
          type="text"
          placeholder="Filter by user..."
          value={filters.username}
          onChange={(e) => {
            setFilters((f) => ({ ...f, username: e.target.value }))
            setPage(0)
          }}
          className="h-7 w-44 rounded-lg border border-tw-border bg-transparent px-2.5 text-[13px] text-white transition-colors outline-none placeholder:text-[#FFFFFF59] focus:border-tw-accent/50"
        />

        {hasFilters && (
          <Button
            variant="ghost"
            type="button"
            onClick={() => {
              setFilters({ action: null, username: "" })
              setPage(0)
            }}
            className="cursor-pointer border-none bg-transparent px-2 py-1 text-[13px] text-[#FFFFFF59] transition-colors hover:text-white"
          >
            Clear
          </Button>
        )}
      </div>

      {/* Event list */}
      <div
        className={`overflow-hidden rounded-xl border border-tw-border bg-tw-card transition-opacity ${isFilterFetching ? "opacity-60" : ""}`}
      >
        {events.length === 0 ? (
          <div className="py-16 text-center">
            <p className="m-0 text-sm text-[#FFFFFF59]">
              {hasFilters
                ? "No events match your filters"
                : "No events yet — activity will appear as webhooks come in"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-white/[0.03]">
            {events.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                orgSlug={org?.slug ?? ""}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-[#FFFFFF59] tabular-nums">
            {page * limit + 1}–{Math.min((page + 1) * limit, total)} of{" "}
            {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="cursor-pointer rounded-lg border border-tw-border bg-transparent px-3 py-1 text-[13px] font-medium text-[#FFFFFF73] transition-colors hover:bg-white/[0.03] disabled:cursor-default disabled:opacity-30"
            >
              Prev
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={(page + 1) * limit >= total}
              className="cursor-pointer rounded-lg border border-tw-border bg-transparent px-3 py-1 text-[13px] font-medium text-[#FFFFFF73] transition-colors hover:bg-white/[0.03] disabled:cursor-default disabled:opacity-30"
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
