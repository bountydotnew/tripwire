import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { formatRelativeTime } from "#/lib/format"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/research/$runId")({
  // Prefetch the run status so the page paints from cache.
  loader: ({ context, params }) => {
    void context.queryClient.prefetchQuery(
      context.trpc.research.status.queryOptions({ runId: params.runId }),
    )
  },
  component: ResearchRunDetailPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Research run"),
      description: "Detail view for a single research run.",
      robots: "noindex",
    }),
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
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-10 md:px-[50px]">
      <div className="flex flex-col gap-2">
        <Link
          to="/admin/research"
          className="text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
        >
          ← All runs
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[16px] font-semibold text-tw-text-primary">
            {run?.name ?? "Loading…"}
          </h1>
          <p className="m-0 flex items-center gap-2 text-[11px] text-tw-text-tertiary">
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
          <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
            <Stat label="Status">
              <StatusBadge status={run.status} />
            </Stat>
            <Stat label="Requested" value={String(run.stats.requested)} />
            <Stat label="Completed" value={String(run.stats.completed)} />
            <Stat label="Errored" value={String(run.stats.errored)} />
            <Stat label="PRs" value={String(run.stats.prs)} />
          </div>

          {run.status === "running" || run.status === "queued" ? (
            <div className="rounded-xl border border-tw-border-card bg-tw-card p-3 text-[12px] text-tw-text-tertiary">
              In progress, this page refreshes every 2 seconds.
            </div>
          ) : null}

          {run.status === "completed" ? (
            <div className="flex flex-wrap gap-2">
              <ExportButton
                runId={runId}
                kind="contributors"
                label="contributors.csv"
              />
              <ExportButton runId={runId} kind="prs" label="prs.csv" />
              <JsonlButton runId={runId} />
            </div>
          ) : null}

          {run.errorMessage ? (
            <pre className="overflow-x-auto rounded-xl border border-tw-error/20 bg-tw-error/10 p-3 text-[12px] text-tw-error">
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
    <div className="flex flex-col gap-1 rounded-xl border border-tw-border-card bg-tw-card p-3">
      <span className="text-[10px] tracking-wide text-tw-text-tertiary uppercase">
        {label}
      </span>
      <div className="text-[15px] leading-tight font-semibold tabular-nums text-tw-text-primary">
        {children ?? value}
      </div>
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
    <span className={`font-mono text-[13px] capitalize ${tone}`}>{status}</span>
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
      size="xs"
      variant="outline"
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
      size="xs"
      variant="outline"
      onClick={handleClick}
      loading={query.isFetching}
    >
      .jsonl
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
