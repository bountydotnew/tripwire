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

interface EventsCardProps {
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

interface SeverityBadgeProps {
  severity: string | null
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
    <div className="mx-auto flex w-full max-w-[900px] flex-col gap-6 px-4 py-10 md:px-[50px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[16px] font-semibold text-tw-text-primary">
          Reputation
        </h1>
        <p className="m-0 text-[13px] text-tw-text-muted">
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
          className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 font-mono text-[13px] text-tw-text-primary transition-colors outline-none placeholder:text-tw-text-tertiary focus:border-tw-accent"
        />
        <Button type="submit" size="xs">
          Look up
        </Button>
      </form>

      {lookup.isLoading && submitted ? (
        <div className="py-4 text-[13px] text-tw-text-tertiary">Loading…</div>
      ) : null}

      {data && submitted ? (
        data.reputations.length === 0 ? (
          <div className="rounded-xl border border-tw-border-card bg-tw-card p-4 text-[13px] text-tw-text-tertiary">
            No reputation rows for{" "}
            <span className="font-mono text-tw-text-secondary">
              @{submitted}
            </span>
            . The user has never been seen in any repo.
          </div>
        ) : (
          <div className="flex flex-col gap-6">
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
                  <EventsCard
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
    <div className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-[13px] font-medium text-tw-text-primary">
            {row.repoFullName ?? row.repoId}
          </span>
          <span className="text-[11px] text-tw-text-tertiary">
            last seen {formatRelativeTime(row.lastSeenAt)}
          </span>
        </div>
        <Button
          size="xs"
          variant="ghost"
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

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <NumberField label="Score" value={score} onChange={setScore} />
        <NumberField
          label="Allows"
          value={totalAllows}
          onChange={setTotalAllows}
        />
        <NumberField
          label="Blocks"
          value={totalBlocks}
          onChange={setTotalBlocks}
        />
        <NumberField
          label="Near misses"
          value={totalNearMisses}
          onChange={setTotalNearMisses}
        />
      </div>

      <div className="flex items-center justify-end">
        <Button
          size="xs"
          disabled={!dirty || setMutation.isPending}
          loading={setMutation.isPending}
          onClick={onSave}
        >
          Save
        </Button>
      </div>
    </div>
  )
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-tw-text-tertiary">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 text-[13px] tabular-nums text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
      />
    </div>
  )
}

function EventsCard({ events, username, onChanged }: EventsCardProps) {
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
      <div className="rounded-xl border border-tw-border-card bg-tw-card p-4 text-[12px] text-tw-text-tertiary">
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
    <div className="divide-y divide-[#27272A] rounded-xl border border-tw-border-card bg-tw-card">
      <div className="flex items-center justify-between px-3 py-2">
        <span className="text-[11px] text-tw-text-tertiary">
          Recent events ({events.length})
        </span>
        <Button
          size="xs"
          variant="destructive-outline"
          disabled={selected.size === 0 || deleteMutation.isPending}
          loading={deleteMutation.isPending}
          onClick={() =>
            deleteMutation.mutate({ eventIds: Array.from(selected) })
          }
        >
          Delete{selected.size > 0 ? ` (${selected.size})` : ""}
        </Button>
      </div>
      {events.map((e) => (
        <div
          key={e.id}
          className="group flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-tw-hover"
        >
          <Checkbox
            checked={selected.has(e.id)}
            onCheckedChange={() => toggle(e.id)}
            aria-label={`Select event ${e.id}`}
          />
          <span className="w-[120px] shrink-0 font-mono text-[11px] text-tw-text-tertiary">
            {formatRelativeTime(e.createdAt)}
          </span>
          <span className="w-[140px] shrink-0 font-mono text-[12px] text-tw-text-primary">
            {e.action}
          </span>
          <SeverityBadge severity={e.severity} />
          <span className="w-[60px] shrink-0 text-right">
            <ImpactCell action={e.action} createdAt={e.createdAt} />
          </span>
          <span className="w-[60px] shrink-0 font-mono text-[11px] text-tw-text-tertiary">
            {e.githubRef ?? "—"}
          </span>
          <span className="min-w-0 flex-1 truncate text-[12px] text-tw-text-secondary">
            {e.description ?? "—"}
          </span>
        </div>
      ))}
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
        : "text-tw-text-tertiary"
  return (
    <span
      className={`font-mono text-[11px] tabular-nums ${tone}`}
      title={impact.note ?? undefined}
    >
      {sign}
      {impact.delta.toFixed(1)}
    </span>
  )
}

function SeverityBadge({ severity }: SeverityBadgeProps) {
  if (!severity)
    return (
      <span className="w-[70px] shrink-0 text-[11px] text-tw-text-tertiary">
        —
      </span>
    )
  const tone =
    severity === "error"
      ? "text-tw-error"
      : severity === "warning"
        ? "text-tw-warning"
        : severity === "success"
          ? "text-tw-success"
          : "text-tw-text-tertiary"
  return (
    <span
      className={`w-[70px] shrink-0 font-mono text-[11px] tracking-wide ${tone}`}
    >
      {severity}
    </span>
  )
}
