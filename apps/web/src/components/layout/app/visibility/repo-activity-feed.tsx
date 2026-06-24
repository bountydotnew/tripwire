import { useMemo, useState } from "react"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import {
  EVENT_FEED_CATEGORIES,
  type EventFeedCategory,
} from "#/lib/events-design"
import { RepoActivityRow } from "#/components/layout/app/visibility/repo-activity-row"

interface RepoActivityFeedProps {
  repoId: string
  repoFullName?: string
}

const FEED_LIMIT = 25

export function RepoActivityFeed({
  repoId,
  repoFullName,
}: RepoActivityFeedProps) {
  const trpc = useTRPC()
  const [category, setCategory] = useState<EventFeedCategory>("all")

  // Tripwire events: fast DB read, renders immediately.
  const feedQueryOpts = trpc.visibility.feed.queryOptions({
    repoId,
    limit: FEED_LIMIT,
    category,
  })
  const feedQuery = useQuery({
    ...feedQueryOpts,
    enabled: !!repoId,
    staleTime: 15_000,
    retry: false,
    placeholderData: keepPreviousData,
    meta: { persist: true },
  })

  useGitHubSignalStream(
    useRepoSignalTargets(repoFullName, [feedQueryOpts.queryKey])
  )

  const events = useMemo(() => feedQuery.data ?? [], [feedQuery.data])

  const isInitialLoad = feedQuery.isLoading && !feedQuery.data

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-[520] tracking-[-0.2px] text-tw-text-primary">
          Recent activity
        </span>
        <div className="flex items-center gap-0.5 rounded-md border border-tw-border bg-tw-inner p-0.5">
          {EVENT_FEED_CATEGORIES.map((c) => (
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
