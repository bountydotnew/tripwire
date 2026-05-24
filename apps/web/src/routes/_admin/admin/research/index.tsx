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
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-4 py-10 md:px-8">
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
            Research Runs
          </h1>
          <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
            Bulk-score contributor cohorts against the rule pipeline.
          </p>
        </div>
        <Link to="/admin/research/new">
          <Button variant="default" size="sm">
            New run
          </Button>
        </Link>
      </div>

      {runs.isLoading ? (
        <div className="rounded-2xl border border-tw-border bg-tw-card px-4 py-6 text-[13px] text-tw-text-muted">
          Loading…
        </div>
      ) : runs.data && runs.data.length > 0 ? (
        <div className="overflow-clip rounded-2xl border border-tw-border bg-tw-card">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-tw-border/60">
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Name
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Status
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Requested
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Done
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Errored
                  </th>
                  <th className="px-3 py-2.5 text-right text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    PRs
                  </th>
                  <th className="px-3 py-2.5 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((run) => (
                  <tr
                    key={run.id}
                    className="border-b border-tw-border/40 transition-colors last:border-b-0 hover:bg-tw-hover"
                  >
                    <td className="px-3 py-2.5">
                      <Link
                        to="/admin/research/$runId"
                        params={{ runId: run.id }}
                        className="font-medium text-tw-accent hover:underline"
                      >
                        {run.name}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={run.status} />
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tw-text-secondary">
                      {run.stats.requested}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tw-text-secondary">
                      {run.stats.completed}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tw-text-secondary">
                      {run.stats.errored}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-tw-text-secondary">
                      {run.stats.prs}
                    </td>
                    <td className="px-3 py-2.5 text-tw-text-muted">
                      {formatRelativeTime(run.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-tw-border bg-tw-card px-4 py-12 text-center text-[13px] text-tw-text-muted">
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
      ? "border-tw-warning/20 bg-tw-warning/10 text-tw-warning"
      : status === "running"
        ? "border-tw-accent/20 bg-tw-accent/10 text-tw-accent"
        : status === "completed"
          ? "border-tw-success/20 bg-tw-success/10 text-tw-success"
          : status === "failed"
            ? "border-tw-error/20 bg-tw-error/10 text-tw-error"
            : "border-tw-border bg-tw-inner text-tw-text-secondary"
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[10px] font-medium tracking-wide capitalize ${tone}`}
    >
      {status}
    </span>
  )
}
