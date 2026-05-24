import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { formatRelativeTime } from "#/lib/format"

export const Route = createFileRoute("/_admin/admin/research/")({
  component: ResearchRunsPage,
})

interface StatusBadgeProps {
  status: string
}

function ResearchRunsPage() {
  const trpc = useTRPC()
  const runs = useQuery({ ...trpc.research.list.queryOptions({ limit: 50 }) })

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-10 md:px-[50px]">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[16px] font-semibold text-tw-text-primary">
            Research Runs
          </h1>
          <p className="m-0 text-[13px] text-tw-text-muted">
            Bulk-score contributor cohorts against the rule pipeline.
          </p>
        </div>
        <Link to="/admin/research/new">
          <Button size="xs">New run</Button>
        </Link>
      </div>

      {runs.isLoading ? (
        <div className="py-4 text-[13px] text-tw-text-tertiary">Loading…</div>
      ) : runs.data && runs.data.length > 0 ? (
        <div className="divide-y divide-[#27272A] rounded-xl border border-tw-border-card bg-tw-card">
          <div className="grid grid-cols-[1fr_90px_repeat(4,72px)_120px] items-center gap-3 px-3 py-2 text-[10px] tracking-wide text-tw-text-tertiary uppercase">
            <span>Name</span>
            <span>Status</span>
            <span className="text-right">Req</span>
            <span className="text-right">Done</span>
            <span className="text-right">Err</span>
            <span className="text-right">PRs</span>
            <span>Created</span>
          </div>
          {runs.data.map((run) => (
            <div
              key={run.id}
              className="grid grid-cols-[1fr_90px_repeat(4,72px)_120px] items-center gap-3 px-3 py-2.5 transition-colors hover:bg-tw-hover"
            >
              <Link
                to="/admin/research/$runId"
                params={{ runId: run.id }}
                className="truncate text-[13px] font-medium text-tw-text-primary hover:text-tw-accent"
              >
                {run.name}
              </Link>
              <StatusBadge status={run.status} />
              <span className="text-right text-[12px] tabular-nums text-tw-text-secondary">
                {run.stats.requested}
              </span>
              <span className="text-right text-[12px] tabular-nums text-tw-text-secondary">
                {run.stats.completed}
              </span>
              <span className="text-right text-[12px] tabular-nums text-tw-text-secondary">
                {run.stats.errored}
              </span>
              <span className="text-right text-[12px] tabular-nums text-tw-text-secondary">
                {run.stats.prs}
              </span>
              <span className="text-[11px] text-tw-text-tertiary">
                {formatRelativeTime(run.createdAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-tw-border-card bg-tw-card p-6 text-center text-[13px] text-tw-text-tertiary">
          No runs yet. Click{" "}
          <span className="font-mono text-tw-text-secondary">New run</span> to
          get started.
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: StatusBadgeProps) {
  const tone =
    status === "queued"
      ? "text-tw-warning"
      : status === "running"
        ? "text-tw-accent"
        : status === "completed"
          ? "text-tw-success"
          : status === "failed"
            ? "text-tw-error"
            : "text-tw-text-tertiary"
  return (
    <span
      className={`font-mono text-[11px] tracking-wide capitalize ${tone}`}
    >
      {status}
    </span>
  )
}
