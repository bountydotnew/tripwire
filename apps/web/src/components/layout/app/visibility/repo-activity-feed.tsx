import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import { collapsePushEvents } from "#/lib/github/repo-events"
import type { FeedCategory, FeedEvent } from "#/lib/github/repo-events"
import { RepoActivityRow } from "#/components/layout/app/visibility/repo-activity-row"

interface RepoActivityFeedProps {
  repoId: string
  repoFullName?: string
}

const CATEGORIES: { label: string; value: FeedCategory }[] = [
  { label: "All", value: "all" },
  { label: "Security", value: "security" },
  { label: "Activity", value: "activity" },
]

const FEED_LIMIT = 25

export function RepoActivityFeed({
  repoId,
  repoFullName,
}: RepoActivityFeedProps) {
  const trpc = useTRPC()
  const [category, setCategory] = useState<FeedCategory>("all")

  // Tripwire events: fast DB read, renders immediately.
  const tripwireQueryOpts = trpc.visibility.feed.queryOptions({
    repoId,
    limit: FEED_LIMIT,
    category,
  })
  const tripwireQuery = useQuery({
    ...tripwireQueryOpts,
    enabled: !!repoId,
    staleTime: 15_000,
    retry: false,
    placeholderData: keepPreviousData,
    meta: { persist: true },
  })

  // GitHub activity: cached server-side, loads independently and merges in.
  // Skipped for the security filter (GitHub events are all "activity").
  const githubQueryOpts = trpc.visibility.githubActivity.queryOptions({
    repoId,
    limit: FEED_LIMIT,
  })
  const githubQuery = useQuery({
    ...githubQueryOpts,
    enabled: !!repoId && category !== "security",
    staleTime: 60_000,
    retry: false,
    placeholderData: keepPreviousData,
    meta: { persist: true },
  })

  useGitHubSignalStream(
    useRepoSignalTargets(repoFullName, [
      tripwireQueryOpts.queryKey,
      githubQueryOpts.queryKey,
    ])
  )

  const events = useMemo<FeedEvent[]>(() => {
    const tripwire = tripwireQuery.data ?? []
    const github = category === "security" ? [] : (githubQuery.data ?? [])
    const merged = [...tripwire, ...github].sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    return collapsePushEvents(merged).slice(0, FEED_LIMIT)
  }, [tripwireQuery.data, githubQuery.data, category])

  // Only the fast Tripwire query gates the skeleton — the page and feed
  // paint as soon as it resolves; GitHub activity fills in afterwards.
  const isInitialLoad = tripwireQuery.isLoading && !tripwireQuery.data

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-[520] tracking-[-0.2px] text-tw-text-primary">
          Recent activity
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-tw-border bg-tw-inner p-0.5">
          {CATEGORIES.map((c) => (
            <Button
              key={c.value}
              variant="ghost"
              size="xs"
              onClick={() => setCategory(c.value)}
              className={`h-6 rounded-[5px] border-transparent px-2 text-[12px] font-medium ${
                category === c.value
                  ? "bg-tw-card text-tw-text-primary"
                  : "text-tw-text-muted hover:text-tw-text-secondary"
              }`}
            >
              {c.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-tw-border bg-tw-card">
        {isInitialLoad ? (
          <FeedSkeleton />
        ) : events.length === 0 ? (
          <p className="px-4 py-10 text-center text-[13px] text-tw-text-muted">
            No recent activity — events will appear as they come in.
          </p>
        ) : (
          <div className="max-h-[420px] divide-y divide-white/3 overflow-y-auto overscroll-contain">
            {events.map((event) => (
              <RepoActivityRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="divide-y divide-white/3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
          <div className="size-2 rounded-full bg-white/5" />
          <div className="h-3.5 flex-1 rounded bg-white/5" />
          <div className="h-3.5 w-12 rounded bg-white/5" />
        </div>
      ))}
    </div>
  )
}
