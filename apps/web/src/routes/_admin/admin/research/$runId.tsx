import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { formatRelativeTime } from "#/lib/format"

export const Route = createFileRoute("/_admin/admin/research/$runId")({
  component: ResearchRunDetailPage,
})

interface StatProps {
  label: string
  value?: string
  children?: React.ReactNode
}

interface ExportButtonProps {
  runId: string
  kind: "contributors" | "prs"
  label: string
}

interface JsonlButtonProps {
  runId: string
}

interface StatusBadgeProps {
  status: string
}

function ResearchRunDetailPage() {
  const { runId } = Route.useParams()
  const trpc = useTRPC()

  const status = useQuery({
    ...trpc.research.status.queryOptions({ runId }),
    refetchInterval: (q) => {
      const s = q.state.data?.status
      return s === "queued" || s === "running" ? 2000 : false
    },
  })

  const run = status.data

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-3">
        <Link
          to="/admin/research"
          className="text-[12px] text-tw-text-muted transition-colors hover:text-tw-text-secondary"
        >
          ← All runs
        </Link>
        <div className="flex flex-col gap-1.5">
          <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
            {run?.name ?? "Loading…"}
          </h1>
          <p className="m-0 flex items-center gap-2 font-['Inter',system-ui,sans-serif] text-[12px] text-tw-text-muted">
            <span className="font-mono">{run?.id}</span>
            {run ? (
              <>
                <span>·</span>
                <span>created {formatRelativeTime(run.createdAt)}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>

      {run ? (
        <>
          <div className="grid grid-cols-2 gap-px overflow-clip rounded-2xl border border-tw-border bg-tw-border md:grid-cols-5">
            <Stat label="Status">
              <StatusBadge status={run.status} />
            </Stat>
            <Stat label="Requested" value={String(run.stats.requested)} />
            <Stat label="Completed" value={String(run.stats.completed)} />
            <Stat label="Errored" value={String(run.stats.errored)} />
            <Stat label="PRs" value={String(run.stats.prs)} />
          </div>

          {run.status === "running" || run.status === "queued" ? (
            <div className="rounded-xl border border-tw-border bg-tw-card px-4 py-3 text-[12px] text-tw-text-muted">
              In progress, this page refreshes every 2 seconds.
            </div>
          ) : null}

          {run.status === "completed" ? (
            <div className="flex flex-wrap gap-2">
              <ExportButton
                runId={runId}
                kind="contributors"
                label="Download contributors.csv"
              />
              <ExportButton runId={runId} kind="prs" label="Download prs.csv" />
              <JsonlButton runId={runId} />
            </div>
          ) : null}

          {run.errorMessage ? (
            <pre className="overflow-x-auto rounded-xl border border-tw-error/20 bg-tw-error/10 px-3 py-2.5 text-[12px] text-tw-error">
              {run.errorMessage}
            </pre>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function Stat({ label, value, children }: StatProps) {
  return (
    <div className="flex flex-col gap-1 bg-tw-card px-4 py-3">
      <span className="text-[10px] font-medium tracking-wide text-tw-text-muted uppercase">
        {label}
      </span>
      <div className="text-[18px] leading-tight font-semibold tabular-nums text-tw-text-primary">
        {children ?? value}
      </div>
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
      className={`inline-flex shrink-0 items-center self-start rounded-md border px-2 py-0.5 text-[11px] font-medium tracking-wide capitalize ${tone}`}
    >
      {status}
    </span>
  )
}

function ExportButton({ runId, kind, label }: ExportButtonProps) {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.research.exportCsv.queryOptions({ runId, scope: kind }),
    enabled: false,
  })

  async function handleClick() {
    const result = await query.refetch()
    if (!result.data) return
    triggerDownload(result.data.filename, result.data.body, "text/csv")
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      loading={query.isFetching}
    >
      {label}
    </Button>
  )
}

function JsonlButton({ runId }: JsonlButtonProps) {
  const trpc = useTRPC()
  const query = useQuery({
    ...trpc.research.exportJsonl.queryOptions({ runId }),
    enabled: false,
  })

  async function handleClick() {
    const result = await query.refetch()
    if (!result.data) return
    triggerDownload(
      result.data.filename,
      result.data.body,
      "application/x-ndjson"
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      loading={query.isFetching}
    >
      Download .jsonl
    </Button>
  )
}

function triggerDownload(filename: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
