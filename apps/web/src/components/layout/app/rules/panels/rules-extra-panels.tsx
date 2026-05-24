import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Button } from "@tripwire/ui/button"
import { RepoFilesTree } from "#/components/layout/app/rules/repo-files-tree"
import { PeopleTab } from "#/components/layout/app/rules/people/people-tab"
import { useRulesWorkspace } from "#/providers/rules-workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"
import { WorkflowsEmptyZapIcon32 } from "@tripwire/ui/icons/app-chrome-icons"

export function RulesPeoplePanel() {
  const {
    repoId,
    suggestedQuery,
    blacklistUsers,
    whitelistUsers,
    addBlacklist,
    removeBlacklist,
    addWhitelist,
    removeWhitelist,
    isAdmin,
  } = useRulesWorkspace()

  return (
    <PeopleTab
      suggestedContributors={suggestedQuery.data ?? undefined}
      blacklistUsers={blacklistUsers.map((u) => ({
        ...u,
        reason: null,
        addedBy: null,
        addedAt: null,
      }))}
      whitelistUsers={whitelistUsers.map((u) => ({
        ...u,
        reason: null,
        addedBy: null,
        addedAt: null,
      }))}
      onAddBlacklist={async (username) => {
        if (repoId)
          await addBlacklist.mutateAsync({ repoId, githubUsername: username })
      }}
      onRemoveBlacklist={async (username) => {
        if (repoId)
          await removeBlacklist.mutateAsync({
            repoId,
            githubUsername: username,
          })
      }}
      onAddWhitelist={async (username) => {
        if (repoId)
          await addWhitelist.mutateAsync({ repoId, githubUsername: username })
      }}
      onRemoveWhitelist={async (username) => {
        if (repoId)
          await removeWhitelist.mutateAsync({
            repoId,
            githubUsername: username,
          })
      }}
      isAddingBlacklist={addBlacklist.isPending}
      isAddingWhitelist={addWhitelist.isPending}
      isAdmin={isAdmin}
    />
  )
}

export function RulesRequestsPanel() {
  const {
    requestsQuery,
    vouchRequestsQuery,
    decideRequest,
    decideVouchRequest,
  } = useRulesWorkspace()

  return (
    <RequestsTab
      repoRequests={requestsQuery.data ?? []}
      repoRequestsLoading={requestsQuery.isLoading}
      vouchRequests={vouchRequestsQuery.data ?? []}
      vouchRequestsLoading={vouchRequestsQuery.isLoading}
      onDecideRepoRequest={(id, decision) =>
        decideRequest.mutate({ requestId: id, decision })
      }
      onDecideVouchRequest={(id, decision) =>
        decideVouchRequest.mutate({ requestId: id, decision })
      }
      isDecidingRepo={decideRequest.isPending}
      isDecidingVouch={decideVouchRequest.isPending}
    />
  )
}

function RequestsTab({
  repoRequests,
  repoRequestsLoading,
  vouchRequests,
  vouchRequestsLoading,
  onDecideRepoRequest,
  onDecideVouchRequest,
  isDecidingRepo,
  isDecidingVouch,
}: {
  repoRequests: Array<{
    id: string
    kind: string
    githubUsername: string
    avatarUrl: string | null
    reason: string
  }>
  repoRequestsLoading: boolean
  vouchRequests: Array<{
    id: string
    githubUsername: string
    avatarUrl: string | null
    reason: string
  }>
  vouchRequestsLoading: boolean
  onDecideRepoRequest: (id: string, decision: "approve" | "deny") => void
  onDecideVouchRequest: (id: string, decision: "approve" | "deny") => void
  isDecidingRepo: boolean
  isDecidingVouch: boolean
}) {
  const [subtab, setSubtab] = useState<"appeals" | "access" | "vouches">(
    "appeals"
  )
  const appeals = repoRequests.filter((r) => r.kind === "unblock")
  const access = repoRequests.filter((r) => r.kind === "access")
  const loading =
    subtab === "vouches" ? vouchRequestsLoading : repoRequestsLoading
  const items =
    subtab === "appeals"
      ? appeals
      : subtab === "access"
        ? access
        : vouchRequests
  const emptyMsg =
    subtab === "appeals"
      ? "No pending appeals. Blocked users can appeal via the link in their bot comment."
      : subtab === "access"
        ? "No pending access requests."
        : "No pending vouch requests. Users can apply from the vouched contributors page."

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex items-center gap-1 self-start rounded-[10px] bg-tw-card p-1">
        {(
          [
            {
              key: "appeals" as const,
              label: "Appeals",
              count: appeals.length,
            },
            { key: "access" as const, label: "Access", count: access.length },
            {
              key: "vouches" as const,
              label: "Vouches",
              count: vouchRequests.length,
            },
          ] as const
        ).map(({ key, label, count }) => (
          <Button
            variant="ghost"
            key={key}
            type="button"
            onClick={() => setSubtab(key)}
            className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${subtab === key ? "bg-[#FAFAFA1A] text-[#EEEEEE]" : "text-[#9F9FA9] hover:text-[#EEEEEE]"}`}
          >
            {label}
            {count > 0 && (
              <span className="ml-0.5 text-[11px] text-tw-accent tabular-nums">
                {count}
              </span>
            )}
          </Button>
        ))}
      </div>
      {loading ? (
        <div className="flex items-center justify-center rounded-xl bg-tw-card p-6">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl bg-tw-card p-6 text-center">
          <p className="m-0 text-[13px] text-[#FFFFFF73]">{emptyMsg}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((r) => {
            const isVouch = subtab === "vouches"
            const kind = "kind" in r ? r.kind : "vouch"
            const badge = isVouch
              ? "Vouch"
              : kind === "unblock"
                ? "Appeal"
                : "Access"
            const badgeClass =
              kind === "unblock"
                ? "bg-amber-500/15 text-amber-300"
                : "bg-tw-accent/15 text-tw-accent"
            const approveLabel = isVouch
              ? "Vouch"
              : kind === "unblock"
                ? "Unblock"
                : "Add to whitelist"
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-4"
              >
                <div className="flex items-start gap-3">
                  <img
                    src={
                      r.avatarUrl ??
                      `https://github.com/${r.githubUsername}.png`
                    }
                    alt=""
                    className="h-8 w-8 rounded-full bg-white/5"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-medium text-white">
                        @{r.githubUsername}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${badgeClass}`}
                      >
                        {badge}
                      </span>
                    </div>
                    <p className="m-0 text-[13px] whitespace-pre-wrap text-[#FFFFFFB3]">
                      {r.reason}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end">
                  <Button
                    size="xs"
                    variant="ghost"
                    disabled={isVouch ? isDecidingVouch : isDecidingRepo}
                    onClick={() =>
                      isVouch
                        ? onDecideVouchRequest(r.id, "deny")
                        : onDecideRepoRequest(r.id, "deny")
                    }
                    className="text-[12px] text-tw-text-tertiary hover:text-red-400"
                  >
                    Deny
                  </Button>
                  <Button
                    size="xs"
                    disabled={isVouch ? isDecidingVouch : isDecidingRepo}
                    onClick={() =>
                      isVouch
                        ? onDecideVouchRequest(r.id, "approve")
                        : onDecideRepoRequest(r.id, "approve")
                    }
                    className="text-[12px]"
                  >
                    {approveLabel}
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function RulesFilesPanel() {
  const {
    activeConfig,
    repo,
    updateConfig,
    generateRulesMd,
    generatePrTemplate,
    generateAgentsMd,
    updateRepoFileContent,
    toggleRepoFile,
    addHoneypotPhrase,
    removeHoneypotPhrase,
  } = useRulesWorkspace()

  return (
    <RepoFilesTree
      config={activeConfig}
      repoFullName={repo?.fullName ?? "owner/repo"}
      isPending={updateConfig.isPending}
      generateRulesMd={generateRulesMd}
      generatePrTemplate={generatePrTemplate}
      generateAgentsMd={generateAgentsMd}
      onUpdateContent={updateRepoFileContent}
      onToggle={toggleRepoFile}
      onAddHoneypotPhrase={addHoneypotPhrase}
      onRemoveHoneypotPhrase={removeHoneypotPhrase}
    />
  )
}

export function RulesWorkflowsPanel() {
  const { repoId } = useRulesWorkspace()
  return <WorkflowsTab repoId={repoId} />
}

function WorkflowsTab({ repoId }: { repoId: string | undefined }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const { org } = useWorkspace()

  const workflowsQuery = useQuery(
    trpc.workflows.list.queryOptions(
      { repoId: repoId ?? "" },
      { enabled: !!repoId }
    )
  )

  const wfList = workflowsQuery.data ?? []

  const openAutomations = () => navigate({ to: `/${org?.slug}/automations` })
  const openWorkflow = (workflowId: string) =>
    navigate({ to: `/${org?.slug}/automations/${workflowId}` })

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-tw-text-secondary">
          Automation workflows for this repo.
        </p>
        <Button
          size="xs"
          variant="ghost"
          onClick={openAutomations}
          className="shrink-0 text-[12px] text-tw-text-secondary"
        >
          Open editor
        </Button>
      </div>

      {workflowsQuery.isPending ? (
        <div className="py-8 text-center text-[13px] text-tw-text-muted">
          Loading...
        </div>
      ) : wfList.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-tw-border-card bg-tw-card p-8">
          <WorkflowsEmptyZapIcon32 />
          <div className="text-center">
            <p className="m-0 text-[13px] text-tw-text-primary">
              No workflows yet
            </p>
            <p className="m-0 mt-1 text-[12px] text-[#FFFFFF40]">
              Workflows automate how Tripwire responds to PRs, issues, and
              comments.
            </p>
          </div>
          <Button
            size="sm"
            variant="default"
            onClick={openAutomations}
            className="mt-1 text-[12px]"
          >
            Create a workflow
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {wfList.map((wf) => {
            const nodeCount =
              (wf.definition as { nodes: unknown[] }).nodes?.length ?? 0
            return (
              <div
                key={wf.id}
                role="button"
                tabIndex={0}
                onClick={() => openWorkflow(wf.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault()
                    openWorkflow(wf.id)
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-tw-border-card bg-tw-card p-3 text-left transition-colors hover:border-[#FFFFFF1A]"
              >
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] font-medium text-tw-text-primary">
                    {wf.name}
                  </span>
                  <span className="text-[11px] text-tw-text-muted">
                    {nodeCount} node{nodeCount !== 1 ? "s" : ""} · Updated{" "}
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${wf.enabled ? "bg-tw-success/10 text-tw-success" : "bg-tw-inner text-tw-text-muted"}`}
                >
                  {wf.enabled ? "Active" : "Draft"}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
