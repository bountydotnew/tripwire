import { Link, Outlet } from "@tanstack/react-router"
import { RulesSaveBar } from "#/components/rules/rules-save-bar"
import { EmptyState } from "#/components/layout/empty-state"
import { Button } from "#/components/ui/button"
import { Checkbox } from "#/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog"
import {
  rulesPathForTab,
  type RulesWorkspaceTab,
} from "#/components/rules/rules-tab-paths"
import {
  RulesWorkspaceProvider,
  useRulesWorkspace,
} from "#/components/rules/rules-workspace-context"
import { RulesWorkspaceSkeleton } from "#/components/rules/rules-workspace-skeleton"
import {
  RulesNavMarketplaceIcon14,
  RulesNavInstalledCheckIcon14,
  RulesNavPeopleIcon14,
  RulesNavRequestsIcon14,
  RulesNavFilesIcon14,
  RulesNavWorkflowsZapIcon14,
  RulesSearchLoupeMutedIcon14,
} from "#/components/icons/rules-workspace-nav-icons"

function navClass(active: boolean): string {
  return `flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
    active ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"
  }`
}

function navClassRow(active: boolean): string {
  return `flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${
    active ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"
  }`
}

export function RulesWorkspaceLayoutRoute() {
  return (
    <RulesWorkspaceProvider>
      <RulesWorkspaceLayoutInner />
    </RulesWorkspaceProvider>
  )
}

function RulesWorkspaceLayoutInner() {
  const v = useRulesWorkspace()

  if (v.showEmptyInstall) {
    return (
      <EmptyState
        title="Install the Tripwire GitHub App"
        description="Connect your GitHub repositories to start protecting them from spam PRs, bot accounts, and AI-generated contributions."
        action={{
          label: "Install GitHub App",
          href: `https://github.com/apps/${v.githubAppSlug}/installations/new`,
        }}
      />
    )
  }

  if (v.isCustomRoute) {
    return <Outlet />
  }

  if (v.isDataLoading) {
    return <RulesWorkspaceSkeleton />
  }

  const tabLink = (tab: RulesWorkspaceTab) => rulesPathForTab(v.orgHandle, tab)

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 md:px-[50px] md:py-10">
      <div className="grid grid-cols-[180px_1fr] items-start gap-6">
        <div className="sticky top-4 flex max-h-[calc(100vh-2rem)] flex-col gap-4 self-start overflow-y-auto pt-1">
          <div>
            <h1 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.02em] text-white">
              Rules
            </h1>
            <p className="m-0 mt-0.5 text-[13px] text-[#FFFFFF73]">
              {v.activeCount} active
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="text-[11px] tracking-wide text-[#FFFFFF59] uppercase">
              Watching
            </div>
            {(
              [
                { key: "pullRequests" as const, label: "Pull requests" },
                { key: "issues" as const, label: "Issues" },
                { key: "comments" as const, label: "Comments" },
              ] as const
            ).map(({ key, label }) => {
              const checked = v.activeConfig.contentScope[key]
              return (
                <label
                  key={key}
                  className="-mx-1 flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-[13px] text-[#FFFFFFCC] select-none hover:bg-[#ffffff08]"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      v.toggleScope(key, value === true)
                    }
                  />
                  {label}
                </label>
              )
            })}
            {!v.activeConfig.contentScope.pullRequests &&
            !v.activeConfig.contentScope.issues &&
            !v.activeConfig.contentScope.comments ? (
              <p className="m-0 mt-1 text-[11px] leading-snug text-amber-300/80">
                Tripwire isn&apos;t watching anything — rules won&apos;t run.
              </p>
            ) : null}
          </div>

          <nav className="-mx-1.5 flex flex-col gap-0.5">
            <Link
              to={tabLink("marketplace")}
              className={navClass(v.activeTab === "marketplace")}
            >
              <RulesNavMarketplaceIcon14 />
              Marketplace
            </Link>
            <Link
              to={tabLink("installed")}
              className={navClassRow(v.activeTab === "installed")}
            >
              <span className="flex items-center gap-2">
                <RulesNavInstalledCheckIcon14 />
                Installed
              </span>
              <span className="text-[11px] text-[#FFFFFF59] tabular-nums">
                {v.activeCount}
              </span>
            </Link>
            {/* Custom hub link (disabled): use RulesNavCustomRuleIcon14 + tabLink("custom") when re-enabling */}
            <Link
              to={tabLink("people")}
              className={navClass(v.activeTab === "people")}
            >
              <RulesNavPeopleIcon14 />
              People
            </Link>
            <Link
              to={tabLink("requests")}
              className={navClassRow(v.activeTab === "requests")}
            >
              <span className="flex items-center gap-2">
                <RulesNavRequestsIcon14 />
                Requests
              </span>
              {v.pendingRequestCount + v.pendingVouchCount > 0 && (
                <span className="text-[11px] text-tw-accent tabular-nums">
                  {v.pendingRequestCount + v.pendingVouchCount}
                </span>
              )}
            </Link>
            <Link
              to={tabLink("files")}
              className={navClass(v.activeTab === "files")}
            >
              <RulesNavFilesIcon14 />
              Files
            </Link>
            <Link
              to={tabLink("workflows")}
              className={navClassRow(v.activeTab === "workflows")}
            >
              <span className="flex items-center gap-2">
                <RulesNavWorkflowsZapIcon14 />
                Workflows
              </span>
            </Link>
          </nav>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          {v.activeTab !== "people" && (
            <div className="flex h-9 items-center gap-2 rounded-[10px] bg-tw-card px-2.5">
              <RulesSearchLoupeMutedIcon14 />
              <input
                value={v.searchQuery}
                onChange={(e) => v.setSearchQuery(e.target.value)}
                placeholder={
                  v.activeTab === "marketplace"
                    ? "Search all rules"
                    : "Search installed rules"
                }
                className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
              />
            </div>
          )}

          <Outlet />
        </div>
      </div>

      <RulesSaveBar
        dirty={v.dirty}
        saving={v.updateConfig.isPending}
        saved={v.showSavedState}
        changes={v.changes}
        onSave={() => {
          void v.handleSave()
        }}
        onDiscard={v.handleDiscard}
        onRevert={v.handleRevert}
      />

      <Dialog
        open={v.leaveBlocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) {
            v.leaveBlocker.reset?.()
          }
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[360px] border-transparent bg-tw-card p-0"
        >
          <DialogHeader className="px-5 py-4">
            <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
              Leave without saving?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-tw-text-secondary">
              Unsaved rule changes will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            className="gap-1.5 border-t border-white/[0.05] bg-transparent px-2 py-2"
            variant="default"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => v.leaveBlocker.reset?.()}
              className="h-8 rounded-[10px] px-3 text-[12px] text-tw-text-tertiary hover:bg-tw-hover hover:text-tw-text-secondary"
            >
              Stay
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => v.leaveBlocker.proceed?.()}
              className="h-8 rounded-[10px] bg-white px-3 text-[12px] text-black hover:bg-white/90"
            >
              Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
