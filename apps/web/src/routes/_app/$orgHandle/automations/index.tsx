import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@tripwire/ui/button"
import { AnimatePresence, motion } from "framer-motion"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { parseAsStringEnum, useQueryState } from "nuqs"
import { useWorkspace } from "#/providers/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { templates } from "#/constants/automation-templates"
import type { WorkflowTemplate } from "#/constants/automation-templates"
import type { Node, Edge } from "@xyflow/react"
import {
  PlusStrokeIcon14,
  PlusStrokeIcon18,
  WorkflowZapFillIcon14,
  SmallXStrokeIcon12,
  StrokeXIcon10Muted,
  SaveBarSuccessCheckIcon12,
  UserCircleMutedIcon13,
} from "@tripwire/ui/icons/app-chrome-icons"

export const Route = createFileRoute("/_app/$orgHandle/automations/")({
  component: AutomationsPage,
})

// ─── Page ───────────────────────────────────────────────────────

function AutomationsPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { orgHandle } = Route.useParams()
  const { repo } = useWorkspace()

  const [tab, setTab] = useQueryState(
    "tab",
    parseAsStringEnum(["workflows", "reports"] as const).withDefault(
      "workflows"
    )
  )

  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState("")

  // Pending toggle changes (not yet saved)
  const [pendingToggles, setPendingToggles] = useState<Map<string, boolean>>(
    new Map()
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = pendingToggles.size > 0

  // Fetch workflows for this repo
  const workflowsQuery = useQuery(
    trpc.workflows.list.queryOptions(
      { repoId: repo?.id ?? "" },
      { enabled: !!repo?.id }
    )
  )
  const wfList = workflowsQuery.data ?? []

  const createWf = useMutation(trpc.workflows.create.mutationOptions())
  const deleteWf = useMutation(trpc.workflows.delete.mutationOptions())
  const toggleWf = useMutation(trpc.workflows.update.mutationOptions())

  const handleCreate = (definition?: { nodes: Node[]; edges: Edge[] }) => {
    if (!repo?.id || !newName.trim()) return
    createWf.mutate(
      {
        repoId: repo.id,
        name: newName.trim(),
        definition: definition ?? { nodes: [], edges: [] },
      },
      {
        onSuccess: (wf) => {
          setIsCreating(false)
          setNewName("")
          if (repo?.id)
            queryClient.invalidateQueries({
              queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
            })
          navigate({ to: `/${orgHandle}/automations/${wf.id}` })
        },
      }
    )
  }

  const handlePreviewTemplate = (template: WorkflowTemplate) => {
    navigate({
      to: `/${orgHandle}/automations/preview?template=${template.id}`,
    })
  }

  const handleDelete = (id: string) => {
    deleteWf.mutate(
      { id },
      {
        onSuccess: () => {
          if (repo?.id)
            queryClient.invalidateQueries({
              queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
            })
        },
      }
    )
  }

  const handleToggle = (id: string, enabled: boolean) => {
    setPendingToggles((prev) => {
      const next = new Map(prev)
      // If toggling back to original, remove from pending
      const original = wfList.find((w) => w.id === id)
      if (original && original.enabled === enabled) {
        next.delete(id)
      } else {
        next.set(id, enabled)
      }
      return next
    })
  }

  const handleSaveToggles = async () => {
    setSaving(true)
    const promises = Array.from(pendingToggles.entries()).map(([id, enabled]) =>
      toggleWf.mutateAsync({ id, enabled })
    )
    await Promise.all(promises)
    setPendingToggles(new Map())
    setSaving(false)
    setSaved(true)
    if (repo?.id)
      queryClient.invalidateQueries({
        queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
      })
    setTimeout(() => setSaved(false), 2000)
  }

  const handleDiscardToggles = () => {
    setPendingToggles(new Map())
  }

  // Resolve displayed enabled state (pending overrides server)
  const getEffectiveEnabled = (wf: { id: string; enabled: boolean }) =>
    pendingToggles.has(wf.id) ? pendingToggles.get(wf.id)! : wf.enabled

  // List + Reports view
  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-tw-text-primary">
            Automations
          </h2>
          <p className="mt-0.5 text-[13px] text-tw-text-secondary">
            Visual workflows that process contributors through rule chains,
            logic gates, and actions.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-5 flex w-fit items-center gap-1 self-start rounded-[10px] bg-tw-card p-1">
        {[
          ["workflows", "Workflows"] as const,
          ["reports", "Reports"] as const,
        ].map(([t, label]) => (
          <Button
            variant="ghost"
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex h-7 cursor-pointer items-center justify-center rounded-[6px] px-3 text-[12px] font-medium transition-colors ${
              tab === t
                ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                : "text-[#9F9FA9] hover:text-[#EEEEEE]"
            }`}
          >
            {label}
          </Button>
        ))}
      </div>

      {tab === "reports" && <ReportsPanel repoId={repo?.id} />}

      {tab === "workflows" && (
        <>
          <div className="mb-4 flex items-center justify-end">
            {!isCreating && (
              <Button
                variant="ghost"
                type="button"
                onClick={() => setIsCreating(true)}
                className="flex h-8 items-center gap-1.5 rounded-lg bg-tw-accent px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
              >
                <PlusStrokeIcon14 className="text-current" />
                New Workflow
              </Button>
            )}
          </div>

          {isCreating && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-tw-border bg-tw-card p-3">
              <input
                type="text"
                placeholder="Workflow name..."
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                autoFocus
                className="h-8 flex-1 rounded-lg bg-tw-inner px-2.5 text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary"
              />
              <Button
                variant="ghost"
                type="button"
                onClick={() => handleCreate()}
                disabled={!newName.trim() || createWf.isPending}
                className="h-8 rounded-lg bg-tw-accent px-3 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {createWf.isPending ? "..." : "Create"}
              </Button>
              <Button
                variant="ghost"
                type="button"
                onClick={() => {
                  setIsCreating(false)
                  setNewName("")
                }}
                className="h-8 rounded-lg px-2 text-[13px] text-tw-text-muted transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
              >
                Cancel
              </Button>
            </div>
          )}

          {workflowsQuery.isPending ? (
            <div className="flex items-center justify-center py-16">
              <span className="text-sm text-tw-text-muted">Loading...</span>
            </div>
          ) : wfList.length === 0 ? (
            <div>
              <div className="mb-6 text-center">
                <p className="mb-1 text-sm font-medium text-tw-text-secondary">
                  No workflows yet
                </p>
                <p className="text-xs text-tw-text-muted">
                  Start from scratch or pick a template below.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Blank workflow card */}
                <Button
                  size="card"
                  variant="ghost"
                  type="button"
                  onClick={() => setIsCreating(true)}
                  className="group flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#FFFFFF1A] p-5 text-center transition-all hover:border-tw-accent/40 hover:bg-[#FFFFFF04]"
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-[#FFFFFF08] transition-colors group-hover:bg-tw-accent/10">
                    <PlusStrokeIcon18 className="text-[#9F9FA9] transition-colors group-hover:text-tw-accent" />
                  </div>
                  <div>
                    <p className="text-[13px] font-medium text-tw-text-primary">
                      Blank Workflow
                    </p>
                    <p className="mt-0.5 text-[11px] text-tw-text-muted">
                      Start with an empty canvas
                    </p>
                  </div>
                </Button>

                {/* Template cards */}
                {templates.map((t) => (
                  <Button
                    size="card"
                    variant="ghost"
                    key={t.id}
                    type="button"
                    onClick={() => handlePreviewTemplate(t)}
                    disabled={createWf.isPending}
                    className="group flex flex-col items-start gap-2 rounded-xl border border-tw-border bg-tw-card p-4 text-left transition-all hover:border-[#FFFFFF1A] disabled:opacity-50"
                  >
                    <span className="truncate text-[13px] font-medium text-tw-text-primary">
                      {t.name}
                    </span>
                    <p className="text-[11px] leading-relaxed text-tw-text-muted">
                      {t.description}
                    </p>
                    <span className="mt-auto text-[11px] text-tw-text-tertiary">
                      {t.nodes.length} nodes · {t.edges.length} connections
                    </span>
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {wfList.map((wf) => {
                const nodeCount =
                  (wf.definition as { nodes: unknown[] }).nodes?.length ?? 0
                const isEnabled = getEffectiveEnabled(wf)
                const isPending = pendingToggles.has(wf.id)
                return (
                  <div
                    key={wf.id}
                    className={`group flex cursor-pointer items-center gap-3 rounded-xl border bg-tw-card p-3 transition-colors ${
                      isPending
                        ? "border-tw-accent/30"
                        : "border-tw-border hover:border-[#FFFFFF1A]"
                    }`}
                    onClick={() =>
                      navigate({ to: `/${orgHandle}/automations/${wf.id}` })
                    }
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#FFFFFF08]">
                      <WorkflowZapFillIcon14 className="size-4 text-[#9F9FA9]" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[13px] font-medium text-tw-text-primary">
                        {wf.name}
                      </span>
                      <span className="text-[11px] text-tw-text-muted">
                        {nodeCount} node{nodeCount !== 1 ? "s" : ""} · Updated{" "}
                        {new Date(wf.updatedAt).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${isEnabled ? "bg-tw-success/10 text-tw-success" : "bg-[#FFFFFF08] text-tw-text-muted"}`}
                      >
                        {isEnabled ? "Active" : "Draft"}
                      </span>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleToggle(wf.id, !isEnabled)
                        }}
                        className={`relative h-[20px] w-9 shrink-0 rounded-[10px] border-none transition-colors ${isEnabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"}`}
                      >
                        <div
                          className={`absolute top-0.5 h-4 w-4 rounded-full transition-all ${isEnabled ? "right-0.5 bg-white" : "left-0.5 bg-[#FFFFFF59]"}`}
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(wf.id)
                        }}
                        className="flex size-7 items-center justify-center rounded-lg opacity-0 transition-all group-hover:opacity-100 hover:bg-[#F56D5D1A]"
                      >
                        <SmallXStrokeIcon12 className="text-[#F56D5D]" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Save bar for pending toggle changes */}
          <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
            <AnimatePresence initial={false}>
              {(dirty || saving || saved) && (
                <motion.div
                  key="save-shell"
                  initial={{ opacity: 0, y: 12, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.98 }}
                  transition={{
                    type: "spring",
                    stiffness: 360,
                    damping: 30,
                    mass: 0.82,
                  }}
                  className="pointer-events-auto"
                >
                  <div
                    className="rounded-2xl bg-tw-card p-1.5"
                    style={{
                      boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a",
                    }}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {saving ? (
                        <motion.div
                          key="saving"
                          initial={{ opacity: 0.92 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex h-9 items-center justify-center px-4"
                        >
                          <motion.span
                            className="size-3 rounded-full border border-tw-text-secondary border-t-transparent"
                            animate={{ rotate: 360 }}
                            transition={{
                              duration: 0.8,
                              ease: "linear",
                              repeat: Infinity,
                            }}
                          />
                        </motion.div>
                      ) : dirty ? (
                        <motion.div
                          key="dirty"
                          initial={{ opacity: 0.92 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex items-center gap-1.5"
                        >
                          <div className="flex h-9 flex-1 items-center px-2.5">
                            <span className="text-[14px] text-tw-text-secondary">
                              {pendingToggles.size} workflow
                              {pendingToggles.size === 1 ? "" : "s"} changed
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={handleDiscardToggles}
                              className="flex size-9 items-center justify-center rounded-[10px] text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
                            >
                              <StrokeXIcon10Muted className="text-tw-text-tertiary" />
                            </Button>
                            <Button
                              variant="ghost"
                              type="button"
                              onClick={handleSaveToggles}
                              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#363639] px-3 transition-colors hover:bg-[#404044]"
                            >
                              <SaveBarSuccessCheckIcon12 className="text-tw-text-secondary" />
                              <span className="text-[13px] leading-none text-tw-text-primary">
                                Save
                              </span>
                            </Button>
                          </div>
                        </motion.div>
                      ) : saved ? (
                        <motion.div
                          key="saved"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="flex h-9 items-center gap-2 px-3"
                        >
                          <SaveBarSuccessCheckIcon12 className="text-tw-text-secondary" />
                          <span className="text-[14px] text-tw-text-primary">
                            Saved
                          </span>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Reports Panel ─────────────────────────────────────────────

function ReportsPanel({ repoId }: { repoId?: string }) {
  const trpc = useTRPC()
  const [kind, setKind] = useState<"user" | "pr" | "issue">("user")
  const [username, setUsername] = useState("")
  const [ref, setRef] = useState("")
  const runReport = useMutation(trpc.workflows.runReport.mutationOptions())

  const handleRun = () => {
    if (!repoId || !username.trim()) return
    runReport.mutate({
      repoId,
      username: username.trim(),
      kind,
      ref: ref.trim() || undefined,
    })
  }

  const report = runReport.data
  const userData = report?.userData

  const placeholders: Record<string, string> = {
    user: "GitHub username...",
    pr: "PR author username...",
    issue: "Issue author username...",
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-3 text-[13px] text-tw-text-secondary">
          Run a user, PR, or issue through your active workflows.
        </p>

        {/* Kind selector */}
        <div className="mb-3 flex w-fit items-center gap-1 rounded-[10px] bg-tw-card p-1">
          {[
            ["user", "User"] as const,
            ["pr", "Pull Request"] as const,
            ["issue", "Issue"] as const,
          ].map(([k, label]) => (
            <Button
              variant="ghost"
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={`flex h-7 cursor-pointer items-center justify-center rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${
                kind === k
                  ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                  : "text-[#9F9FA9] hover:text-[#EEEEEE]"
              }`}
            >
              {label}
            </Button>
          ))}
        </div>

        <div className="flex gap-2">
          {/* Username input */}
          <div className="flex h-9 flex-1 items-center gap-2 rounded-[10px] bg-tw-card px-2.5">
            <UserCircleMutedIcon13 className="text-[#6E6E6E]" />
            <input
              type="text"
              placeholder={placeholders[kind]}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRun()}
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
            />
          </div>

          {/* Ref input (PR/issue number) */}
          {kind !== "user" && (
            <div className="flex h-9 w-28 items-center gap-1.5 rounded-[10px] bg-tw-card px-2.5">
              <span className="text-[13px] text-[#6E6E6E]">#</span>
              <input
                type="text"
                placeholder="Number"
                value={ref}
                onChange={(e) => setRef(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && handleRun()}
                className="w-full flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
              />
            </div>
          )}

          <Button
            variant="ghost"
            type="button"
            onClick={handleRun}
            disabled={runReport.isPending || !username.trim()}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-[10px] bg-[#363639] px-4 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-[#404044] disabled:opacity-50"
          >
            {runReport.isPending ? "Running..." : "Run"}
          </Button>
        </div>
      </div>

      {runReport.isError && (
        <div className="text-[13px] text-tw-error">
          {runReport.error?.message ?? "Failed to run report"}
        </div>
      )}

      {report && (
        <div className="flex flex-col gap-3">
          {/* User card */}
          {userData && (
            <div className="rounded-xl bg-tw-card p-1">
              <div className="flex items-center gap-3 rounded-[10px] bg-tw-inner p-3">
                <img
                  src={userData.user.avatarUrl}
                  alt=""
                  className="size-10 rounded-full"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-tw-text-primary">
                    {userData.user.name ?? userData.user.login}
                  </p>
                  <p className="text-[12px] text-tw-text-muted">
                    @{userData.user.login}
                  </p>
                </div>
                <div
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-medium tabular-nums ${
                    (userData.data.score as number) >= 70
                      ? "bg-tw-success/10 text-tw-success"
                      : (userData.data.score as number) >= 40
                        ? "bg-tw-warning/10 text-tw-warning"
                        : "bg-tw-error/10 text-tw-error"
                  }`}
                >
                  {userData.data.score as number}/100
                </div>
              </div>
            </div>
          )}

          {/* Content card (PR/issue) */}
          {report.contentMeta && (
            <div className="rounded-xl bg-tw-card p-1">
              <div className="flex items-start gap-3 rounded-[10px] bg-tw-inner p-3">
                <span
                  className={`mt-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase ${
                    report.contentMeta.state === "merged"
                      ? "bg-[#A371F7]/10 text-[#A371F7]"
                      : report.contentMeta.state === "open"
                        ? "bg-tw-success/10 text-tw-success"
                        : "bg-tw-error/10 text-tw-error"
                  }`}
                >
                  {report.contentMeta.state}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-tw-text-primary">
                    {report.contentMeta.title}
                  </p>
                  <p className="mt-0.5 text-[11px] text-tw-text-muted">
                    #{report.contentMeta.number}
                  </p>
                </div>
                <a
                  href={report.contentMeta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[11px] text-tw-accent hover:underline"
                >
                  View
                </a>
              </div>
              {report.contentText && (
                <div className="px-3 pt-1 pb-2">
                  <p className="line-clamp-3 text-[11px] leading-relaxed text-tw-text-muted">
                    {report.contentText}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* No active workflows */}
          {report.results.length === 0 && (
            <div className="rounded-xl bg-tw-card p-4 text-center">
              <p className="text-[13px] text-tw-text-muted">
                No active workflows to run against.
              </p>
              <p className="mt-1 text-[11px] text-tw-text-tertiary">
                Enable workflows in the Workflows tab first.
              </p>
            </div>
          )}

          {/* Per-workflow results */}
          {report.results.map((r) => {
            const resultColor =
              r.result === "blocked"
                ? "bg-tw-error/10 border-tw-error/20"
                : r.result === "allowed"
                  ? "bg-tw-success/10 border-tw-success/20"
                  : "bg-[#FFFFFF06] border-tw-border"
            const resultLabel =
              r.result === "blocked"
                ? "BLOCKED"
                : r.result === "allowed"
                  ? "ALLOWED"
                  : "NO ACTION"
            const resultTextColor =
              r.result === "blocked"
                ? "text-tw-error"
                : r.result === "allowed"
                  ? "text-tw-success"
                  : "text-tw-text-muted"

            return (
              <div
                key={r.workflowId}
                className="flex flex-col gap-0.5 rounded-xl bg-tw-card p-1"
              >
                {/* Workflow header */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                  <div className="flex min-w-0 items-center gap-2">
                    <WorkflowZapFillIcon14 className="text-[#9F9FA9]" />
                    <span className="truncate text-[13px] font-medium text-tw-text-primary">
                      {r.workflowName}
                    </span>
                    <span className="text-[11px] text-tw-text-muted">
                      {r.outcomes.length} nodes
                    </span>
                  </div>
                  <span
                    className={`rounded-md border px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase ${resultColor} ${resultTextColor}`}
                  >
                    {resultLabel}
                  </span>
                </div>

                {/* Node trace */}
                <div className="flex flex-col gap-0.5 px-1 pb-1">
                  {r.outcomes.map((o) => {
                    const dotClass =
                      o.status === "pass"
                        ? "bg-tw-success"
                        : o.status === "fail"
                          ? "bg-tw-error"
                          : o.status === "executed"
                            ? "bg-tw-accent"
                            : "bg-tw-text-muted"
                    return (
                      <div
                        key={o.nodeId}
                        className="flex items-center gap-2.5 rounded-[10px] bg-tw-inner px-2.5 py-1.5"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`}
                        />
                        <span className="flex-1 truncate text-[12px] text-tw-text-secondary">
                          {o.label}
                        </span>
                        <span className="max-w-[200px] truncate text-[11px] text-tw-text-muted">
                          {o.detail}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* Actions taken */}
                {r.actions.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 px-3 pb-2">
                    {r.actions.map((a, i) => (
                      <span
                        key={i}
                        className="rounded bg-[#FAFAFA08] px-1.5 py-0.5 text-[10px] text-tw-text-muted"
                      >
                        {a}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
