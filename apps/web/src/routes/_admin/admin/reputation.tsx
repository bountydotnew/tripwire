import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { eventScoreImpact } from "@tripwire/core"
import { Checkbox } from "#/components/ui/checkbox"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "#/components/ui/toast"
import { formatRelativeTime } from "#/lib/format"

export const Route = createFileRoute("/_admin/admin/reputation")({
  component: AdminReputationPage,
})

interface ReputationRow {
  repoId: string | null
  repoFullName: string | null
  githubUsername: string
  githubUserId: number | null
  score: number
  totalAllows: number
  totalBlocks: number
  totalNearMisses: number
  firstSeenAt: Date
  lastSeenAt: Date
  scoreResetAt: Date | null
  updatedAt: Date
}

interface ReputationRowWithRepo extends ReputationRow {
  repoId: string
}

interface EventRow {
  id: string
  repoId: string
  repoFullName: string | null
  action: string
  severity: string | null
  description: string | null
  githubRef: string | null
  ruleName: string | null
  metadata: Record<string, unknown> | null
  createdAt: Date
}

interface ReputationCardProps {
  row: ReputationRowWithRepo
  onChanged: () => void
}

interface EventsTableProps {
  events: EventRow[]
  username: string
  onChanged: () => void
}

interface NumberFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
}

interface ImpactCellProps {
  action: string
  createdAt: Date
}

function AdminReputationPage() {
  const trpc = useTRPC()
  const [input, setInput] = useState("")
  const [submitted, setSubmitted] = useState("")

  const lookup = useQuery({
    ...trpc.adminReputation.lookup.queryOptions({ username: submitted }),
    enabled: submitted.length > 0,
  })

  const data = lookup.data
  const eventsByRepo = useMemo(() => {
    if (!data) return new Map<string, EventRow[]>()
    const out = new Map<string, EventRow[]>()
    for (const e of data.events as EventRow[]) {
      const list = out.get(e.repoId) ?? []
      list.push(e)
      out.set(e.repoId, list)
    }
    return out
  }, [data])

  return (
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-8 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          Reputation
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          Look up a contributor across repos, edit their counters or score,
          and delete events surgically.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(input.trim())
        }}
        className="flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="github-handle"
          autoComplete="off"
          spellCheck={false}
          aria-label="GitHub username"
          className="h-9 flex-1 rounded-lg border border-tw-border bg-tw-inner px-2.5 font-mono text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-muted focus:border-tw-accent"
        />
        <Button type="submit" variant="default" size="sm">
          Look up
        </Button>
      </form>

      {lookup.isLoading && submitted ? (
        <div className="rounded-xl border border-tw-border bg-tw-card px-4 py-6 text-[13px] text-tw-text-muted">
          Loading…
        </div>
      ) : null}

      {data && submitted ? (
        data.reputations.length === 0 ? (
          <div className="rounded-xl border border-tw-border bg-tw-card px-4 py-6 text-[13px] text-tw-text-muted">
            No reputation rows for{" "}
            <span className="font-mono text-tw-text-secondary">
              @{submitted}
            </span>
            . The user has never been seen in any repo.
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {(data.reputations as ReputationRow[])
              .filter(
                (row): row is ReputationRowWithRepo => row.repoId !== null
              )
              .map((row) => (
                <div key={row.repoId} className="flex flex-col gap-3">
                  <ReputationCard
                    row={row}
                    onChanged={() => lookup.refetch()}
                  />
                  <EventsTable
                    events={eventsByRepo.get(row.repoId) ?? []}
                    username={row.githubUsername}
                    onChanged={() => lookup.refetch()}
                  />
                </div>
              ))}
          </div>
        )
      ) : null}
    </div>
  )
}

function ReputationCard({ row, onChanged }: ReputationCardProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [score, setScore] = useState<string>(String(row.score))
  const [totalAllows, setTotalAllows] = useState<string>(
    String(row.totalAllows)
  )
  const [totalBlocks, setTotalBlocks] = useState<string>(
    String(row.totalBlocks)
  )
  const [totalNearMisses, setTotalNearMisses] = useState<string>(
    String(row.totalNearMisses)
  )

  const setMutation = useMutation(
    trpc.adminReputation.setReputation.mutationOptions({
      onSuccess: () => {
        toastManager.add({ type: "success", title: "Reputation updated" })
        queryClient.invalidateQueries({
          queryKey: trpc.adminReputation.lookup.queryKey(),
        })
        onChanged()
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't update" }),
    })
  )

  const rescoreMutation = useMutation(
    trpc.adminReputation.triggerRescore.mutationOptions({
      onSuccess: () =>
        toastManager.add({
          type: "success",
          title: "Rescore enqueued",
          description:
            "score-user Inngest event sent. Refresh in a few seconds.",
        }),
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't trigger rescore" }),
    })
  )

  const dirty =
    Number(score) !== row.score ||
    Number(totalAllows) !== row.totalAllows ||
    Number(totalBlocks) !== row.totalBlocks ||
    Number(totalNearMisses) !== row.totalNearMisses

  const onSave = () => {
    setMutation.mutate({
      repoId: row.repoId,
      username: row.githubUsername,
      score: Number(score),
      totalAllows: Number(totalAllows),
      totalBlocks: Number(totalBlocks),
      totalNearMisses: Number(totalNearMisses),
    })
  }

  return (
    <div className="overflow-clip rounded-2xl border border-tw-border bg-tw-card">
      <div className="flex items-center justify-between border-b border-tw-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[13px] font-medium text-tw-text-primary">
            {row.repoFullName ?? row.repoId}
          </span>
          <span className="text-[11px] text-tw-text-muted">
            last seen {formatRelativeTime(row.lastSeenAt)}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          loading={rescoreMutation.isPending}
          onClick={() =>
            rescoreMutation.mutate({
              repoId: row.repoId,
              username: row.githubUsername,
            })
          }
        >
          Rescore
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 p-4 md:grid-cols-4">
        <NumberField label="Score" value={score} onChange={setScore} />
        <NumberField
          label="Total Allows"
          value={totalAllows}
          onChange={setTotalAllows}
        />
        <NumberField
          label="Total Blocks"
          value={totalBlocks}
          onChange={setTotalBlocks}
        />
        <NumberField
          label="Total Near Misses"
          value={totalNearMisses}
          onChange={setTotalNearMisses}
        />
      </div>

      <div className="flex items-center justify-end border-t border-tw-border bg-tw-bg/30 px-4 py-3">
        <Button
          variant="default"
          size="sm"
          disabled={!dirty || setMutation.isPending}
          loading={setMutation.isPending}
          onClick={onSave}
        >
          Save changes
        </Button>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-tw-border bg-tw-inner px-2.5 text-[13px] tabular-nums text-tw-text-primary outline-none focus:border-tw-accent"
      />
    </div>
  )
}

function EventsTable({ events, username, onChanged }: EventsTableProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const deleteMutation = useMutation(
    trpc.adminReputation.deleteEvents.mutationOptions({
      onSuccess: (data) => {
        toastManager.add({
          type: "success",
          title: `Deleted ${data.deletedCount} event${data.deletedCount === 1 ? "" : "s"}`,
        })
        setSelected(new Set())
        queryClient.invalidateQueries({
          queryKey: trpc.adminReputation.lookup.queryKey(),
        })
        onChanged()
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't delete events" }),
    })
  )

  if (events.length === 0) {
    return (
      <div className="rounded-2xl border border-tw-border bg-tw-card px-4 py-5 text-[12px] text-tw-text-muted">
        No events on this repo for{" "}
        <span className="font-mono text-tw-text-secondary">@{username}</span>.
      </div>
    )
  }

  const toggle = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  return (
    <div className="overflow-clip rounded-2xl border border-tw-border bg-tw-card">
      <div className="flex items-center justify-between border-b border-tw-border px-4 py-2.5">
        <span className="text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
          Recent events ({events.length})
        </span>
        <Button
          variant="destructive-outline"
          size="sm"
          disabled={selected.size === 0 || deleteMutation.isPending}
          loading={deleteMutation.isPending}
          onClick={() =>
            deleteMutation.mutate({ eventIds: Array.from(selected) })
          }
        >
          Delete {selected.size > 0 ? `(${selected.size})` : ""}
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="border-b border-tw-border/60">
              <th className="w-8 px-3 py-2 text-left" />
              <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                When
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                Action
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                Severity
              </th>
              <th className="px-3 py-2 text-right text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                Δ Score
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                Ref
              </th>
              <th className="px-3 py-2 text-left text-[11px] font-medium tracking-wide text-tw-text-muted uppercase">
                Description
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr
                key={e.id}
                className="border-b border-tw-border/40 transition-colors last:border-b-0 hover:bg-tw-hover"
              >
                <td className="px-3 py-2.5">
                  <Checkbox
                    checked={selected.has(e.id)}
                    onCheckedChange={() => toggle(e.id)}
                    aria-label={`Select event ${e.id}`}
                  />
                </td>
                <td className="px-3 py-2.5 font-mono text-tw-text-secondary">
                  {formatRelativeTime(e.createdAt)}
                </td>
                <td className="px-3 py-2.5 font-mono text-tw-text-primary">
                  {e.action}
                </td>
                <td className="px-3 py-2.5">
                  <SeverityBadge severity={e.severity} />
                </td>
                <td className="px-3 py-2.5 text-right">
                  <ImpactCell action={e.action} createdAt={e.createdAt} />
                </td>
                <td className="px-3 py-2.5 font-mono text-tw-text-tertiary">
                  {e.githubRef ?? "—"}
                </td>
                <td className="max-w-[280px] truncate px-3 py-2.5 text-tw-text-secondary">
                  {e.description ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ImpactCell({ action, createdAt }: ImpactCellProps) {
  const impact = eventScoreImpact({ action, createdAt: new Date(createdAt) })
  if (!impact) return <span className="text-tw-text-tertiary">—</span>
  const sign = impact.delta > 0 ? "+" : ""
  const tone =
    impact.delta > 0
      ? "text-tw-success"
      : impact.delta < 0
        ? "text-tw-error"
        : "text-tw-text-muted"
  return (
    <span
      className={`font-mono text-[12px] tabular-nums ${tone}`}
      title={impact.note ?? undefined}
    >
      {sign}
      {impact.delta.toFixed(1)}
    </span>
  )
}

function SeverityBadge({ severity }: { severity: string | null }) {
  if (!severity) return <span className="text-tw-text-tertiary">—</span>
  const tone =
    severity === "error"
      ? "border-tw-error/20 bg-tw-error/10 text-tw-error"
      : severity === "warning"
        ? "border-tw-warning/20 bg-tw-warning/10 text-tw-warning"
        : severity === "success"
          ? "border-tw-success/20 bg-tw-success/10 text-tw-success"
          : "border-tw-border bg-tw-inner text-tw-text-secondary"
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${tone}`}
    >
      {severity}
    </span>
  )
}
