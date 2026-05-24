import { useMemo, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { eventScoreImpact } from "@tripwire/core"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "#/components/ui/toast"

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
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Reputation</h1>
        <p className="text-sm text-zinc-500">
          Look up a contributor across repos, edit their counters/score, or
          delete events surgically.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(input.trim())
        }}
        className="mb-8 flex items-center gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="github-handle"
          autoComplete="off"
          spellCheck={false}
          className="h-9 flex-1 rounded border border-white/10 bg-zinc-950 px-3 font-mono text-sm text-white outline-none placeholder:text-zinc-600 focus:border-zinc-500"
        />
        <Button type="submit" variant="default" size="sm">
          Look up
        </Button>
      </form>

      {lookup.isLoading && submitted ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : null}

      {data && submitted ? (
        data.reputations.length === 0 ? (
          <div className="rounded border border-white/10 bg-zinc-950 px-4 py-6 text-sm text-zinc-500">
            No reputation rows for @{submitted}. The user has never been seen
            in any repo.
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
  const [totalAllows, setTotalAllows] = useState<string>(String(row.totalAllows))
  const [totalBlocks, setTotalBlocks] = useState<string>(String(row.totalBlocks))
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
    <div className="rounded border border-white/10 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm text-white">
            {row.repoFullName ?? row.repoId}
          </span>
          <span className="text-xs text-zinc-500">
            last seen {new Date(row.lastSeenAt).toLocaleString()}
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

      <div className="grid grid-cols-4 gap-3 p-4">
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

      <div className="flex items-center justify-end border-t border-white/5 px-4 py-3">
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

interface NumberFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
}

function NumberField({ label, value, onChange }: NumberFieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] tracking-wide text-zinc-500 uppercase">
        {label}
      </label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded border border-white/10 bg-black px-2 text-sm tabular-nums text-white outline-none focus:border-zinc-500"
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
      <div className="rounded border border-white/10 bg-zinc-950 px-4 py-6 text-xs text-zinc-500">
        No events on this repo for @{username}.
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
    <div className="rounded border border-white/10 bg-zinc-950">
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-2">
        <span className="text-xs text-zinc-500">
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
      <table className="w-full text-xs">
        <thead className="text-[10px] text-zinc-500 uppercase">
          <tr>
            <th className="w-8 px-3 py-2 text-left"></th>
            <th className="px-3 py-2 text-left">When</th>
            <th className="px-3 py-2 text-left">Action</th>
            <th className="px-3 py-2 text-left">Severity</th>
            <th className="px-3 py-2 text-right">Δ Score</th>
            <th className="px-3 py-2 text-left">Ref</th>
            <th className="px-3 py-2 text-left">Description</th>
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr
              key={e.id}
              className="border-t border-white/5 hover:bg-white/[0.02]"
            >
              <td className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(e.id)}
                  onChange={() => toggle(e.id)}
                  className="size-3.5 accent-zinc-300"
                />
              </td>
              <td className="px-3 py-2 font-mono text-zinc-400">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="px-3 py-2 font-mono text-white">{e.action}</td>
              <td className="px-3 py-2 text-zinc-400">{e.severity ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <ImpactCell action={e.action} createdAt={e.createdAt} />
              </td>
              <td className="px-3 py-2 font-mono text-zinc-400">
                {e.githubRef ?? "—"}
              </td>
              <td className="px-3 py-2 text-zinc-300">
                {e.description ?? "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface ImpactCellProps {
  action: string
  createdAt: Date
}

function ImpactCell({ action, createdAt }: ImpactCellProps) {
  const impact = eventScoreImpact({ action, createdAt: new Date(createdAt) })
  if (!impact) return <span className="text-zinc-600">—</span>
  const sign = impact.delta > 0 ? "+" : ""
  const tone =
    impact.delta > 0
      ? "text-emerald-400"
      : impact.delta < 0
        ? "text-rose-400"
        : "text-zinc-500"
  return (
    <span
      className={`font-mono tabular-nums ${tone}`}
      title={impact.note ?? undefined}
    >
      {sign}
      {impact.delta.toFixed(1)}
    </span>
  )
}
