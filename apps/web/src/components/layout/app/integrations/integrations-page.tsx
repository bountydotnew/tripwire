import { useQueryClient, useQuery, useMutation } from "@tanstack/react-query"
import { useCallback, useState } from "react"
import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPopup,
  DialogTitle,
} from "@tripwire/ui/dialog"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@tripwire/ui/pagination"
import { GithubIcon } from "@tripwire/ui/icons/github"
import {
  SearchLoupeOutlineIcon14,
  SuccessCheckStrokeIcon14,
} from "@tripwire/ui/icons/app-chrome-icons"
import { GitHubMarkWhiteIcon20 } from "@tripwire/ui/icons/github-mark-icon"
import { useWorkspace } from "#/providers/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { routes } from "#/lib/routes"
import { buildPageItems } from "#/lib/pagination"
import { useRefreshOnReturn } from "#/lib/use-refresh-on-return"

const REPOS_PER_PAGE = 6

export function IntegrationsPageSkeleton() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-1 h-6 w-32 animate-pulse rounded bg-white/5" />
      <div className="mb-6 h-4 w-72 animate-pulse rounded bg-white/5" />
      <div className="mb-6 h-24 animate-pulse rounded-xl bg-white/5" />
      <div className="h-48 animate-pulse rounded-xl bg-white/5" />
    </div>
  )
}

export function IntegrationsPage() {
  const { org, repos, repo, setRepo, isLoading } = useWorkspace()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const installHref = org
    ? `${routes.api.githubInstall}?org=${encodeURIComponent(org.id)}`
    : routes.api.githubInstall

  const installationsQuery = useQuery(
    trpc.orgs.installationsByBaOrg.queryOptions(
      { baOrgId: org?.id ?? "" },
      { enabled: !!org?.id }
    )
  )
  const installations = installationsQuery.data ?? []
  const isConnected = installations.length > 0

  const [manageDialogOpen, setManageDialogOpen] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const disconnect = useMutation(
    trpc.orgs.disconnectInstallation.mutationOptions({
      onSettled: async () => {
        setConfirmingId(null)
        await queryClient.invalidateQueries()
      },
    })
  )

  const [query, setQuery] = useState("")
  const [page, setPage] = useState(1)

  const trimmedQuery = query.trim().toLowerCase()
  const filtered = trimmedQuery
    ? repos.filter((r) => r.fullName.toLowerCase().includes(trimmedQuery))
    : repos

  const totalPages = Math.max(1, Math.ceil(filtered.length / REPOS_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const visibleRepos = filtered.slice(
    (safePage - 1) * REPOS_PER_PAGE,
    safePage * REPOS_PER_PAGE
  )

  // When the user finishes configuring the GitHub App on github.com and
  // returns to this tab, we have no webhook signal that says "install
  // changed" — use the visibility transition as the cue to refresh.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries()
  }, [queryClient])
  useRefreshOnReturn({ refresh })

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-tw-text-primary">
        Integrations
      </h1>
      <p className="mb-6 text-sm text-tw-text-secondary">
        Connect GitHub to the{" "}
        <span className="text-tw-text-primary">{org?.name ?? "current"}</span>{" "}
        workspace and choose the repository you're working in.
      </p>

      <div className="mb-2 text-[13px] font-medium text-tw-text-secondary">
        GitHub account
      </div>

      {!isConnected ? (
        <div className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-tw-border bg-tw-card p-5">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-tw-inner">
              <GitHubMarkWhiteIcon20 />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[14px] font-medium text-tw-text-primary">
                No GitHub account connected
              </div>
              <div className="text-[12px] leading-snug text-tw-text-muted">
                Install the Tripwire GitHub App to link your repositories to
                this workspace and start moderating contributions.
              </div>
            </div>
          </div>
          <Button
            size="sm"
            className="shrink-0 bg-white px-3 text-black hover:bg-white/90"
            render={
              <a href={installHref} target="_blank" rel="noopener noreferrer">
                Connect
              </a>
            }
          />
        </div>
      ) : (
        <div className="mb-8 flex flex-col gap-2">
          {installations.map((install) => (
            <div
              key={install.id}
              className="flex items-center justify-between gap-4 rounded-xl border border-tw-border bg-tw-card p-4"
            >
              <div className="flex min-w-0 items-center gap-3">
                {install.avatarUrl ? (
                  <img
                    src={install.avatarUrl}
                    alt={install.githubAccountLogin}
                    className="size-9 shrink-0 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-tw-inner">
                    <GitHubMarkWhiteIcon20 />
                  </div>
                )}
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-[14px] font-medium text-tw-text-primary">
                    {install.githubAccountLogin}
                  </span>
                  <span className="text-[12px] text-tw-text-muted">
                    {install.githubAccountType === "Organization"
                      ? "Organization"
                      : "Personal account"}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  size="xs"
                  variant="outline"
                  type="button"
                  onClick={() => setManageDialogOpen(true)}
                >
                  Manage
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  className="text-tw-text-muted hover:text-tw-error"
                  onClick={() => setConfirmingId(install.id)}
                >
                  Uninstall
                </Button>
              </div>
            </div>
          ))}
          <a
            href={installHref}
            target="_blank"
            rel="noopener noreferrer"
            className="px-1 text-[12px] text-tw-text-muted transition-colors hover:text-tw-text-secondary"
          >
            + Connect another account
          </a>
        </div>
      )}

      <Dialog open={manageDialogOpen} onOpenChange={setManageDialogOpen}>
        <DialogPopup
          showCloseButton={false}
          bottomStickOnMobile={false}
          className="fixed top-1/2 left-1/2 row-auto w-[min(460px,calc(100vw-2rem))] max-w-none -translate-x-1/2 -translate-y-1/2"
        >
          <DialogHeader className="px-6 pt-6 pb-5">
            <DialogTitle>Manage GitHub repos</DialogTitle>
            <DialogDescription className="text-[14px]">
              Removing a repo from Tripwire's GitHub App installation will also
              delete its related Tripwire data, including rules, workflows,
              events, lists, requests, and reputation records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare" className="px-6 pt-3 pb-6">
            <DialogClose className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-hover">
              Cancel
            </DialogClose>
            <Button
              size="xs"
              className="bg-white text-black hover:bg-white/90"
              render={
                <a
                  href={installHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setManageDialogOpen(false)}
                >
                  Continue to GitHub
                </a>
              }
            />
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      <Dialog
        open={confirmingId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmingId(null)
        }}
      >
        <DialogPopup
          showCloseButton={false}
          bottomStickOnMobile={false}
          className="fixed top-1/2 left-1/2 row-auto w-[min(460px,calc(100vw-2rem))] max-w-none -translate-x-1/2 -translate-y-1/2"
        >
          <DialogHeader className="px-6 pt-6 pb-5">
            <DialogTitle>Remove from Tripwire?</DialogTitle>
            <DialogDescription className="text-[14px]">
              Uninstalling this GitHub App will also delete its related Tripwire
              data, including rules, workflows, events, lists, requests, and
              reputation records.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter variant="bare" className="px-6 pt-3 pb-6">
            <DialogClose className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-hover">
              Cancel
            </DialogClose>
            <Button
              size="xs"
              variant="destructive"
              disabled={disconnect.isPending}
              onClick={() => {
                if (confirmingId)
                  disconnect.mutate({ installationId: confirmingId })
              }}
            >
              Uninstall
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>

      {isConnected && (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[13px] font-medium text-tw-text-secondary">
              Active repository
            </span>
            <span className="text-[12px] text-tw-text-muted">
              {repos.length} connected
            </span>
          </div>

          {repos.length > REPOS_PER_PAGE && (
            <div className="relative mb-2">
              <SearchLoupeOutlineIcon14 className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-tw-text-muted" />
              <input
                aria-label="Filter repositories"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value)
                  setPage(1)
                }}
                placeholder="Filter repositories…"
                className="h-9 w-full rounded-lg border border-tw-border bg-tw-card pr-3 pl-9 text-[13px] text-tw-text-primary placeholder:text-tw-text-muted focus:border-tw-text-muted focus:outline-none"
              />
            </div>
          )}

          <div className="overflow-hidden rounded-xl border border-tw-border bg-tw-card">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-tw-text-muted">
                Loading repositories…
              </div>
            ) : repos.length === 0 ? (
              <div className="px-4 py-5 text-[13px] text-tw-text-muted">
                This account has no repositories with the Tripwire App installed
                yet. Use Manage to grant repository access.
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-5 text-[13px] text-tw-text-muted">
                No repositories match “{query}”.
              </div>
            ) : (
              <div className="divide-y divide-tw-border">
                {visibleRepos.map((r) => {
                  const isSelected = repo?.id === r.id
                  const [owner, ...rest] = r.fullName.split("/")
                  const name = rest.join("/") || owner
                  return (
                    // biome-ignore lint/correctness/noRestrictedElements: two-line repo row needs a native button for custom layout
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRepo(r)}
                      className={`group flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                        isSelected ? "bg-tw-hover" : "hover:bg-tw-hover-light"
                      }`}
                    >
                      <GithubIcon
                        className={`size-4 shrink-0 ${isSelected ? "text-tw-text-primary" : "text-tw-text-muted"}`}
                      />
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[13px] font-medium text-tw-text-primary">
                          {name}
                        </span>
                        {rest.length > 0 && (
                          <span className="truncate text-[11px] text-tw-text-muted">
                            {owner}
                          </span>
                        )}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center">
                        {isSelected ? (
                          <span className="flex items-center gap-1.5 text-[11px] font-medium text-tw-success">
                            <SuccessCheckStrokeIcon14 />
                            Active
                          </span>
                        ) : (
                          <span className="text-[11px] text-tw-text-tertiary opacity-0 transition-opacity group-hover:opacity-100">
                            Select
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {totalPages > 1 && (
            <Pagination className="mt-3 justify-between">
              <PaginationContent className="w-full justify-between">
                <PaginationItem>
                  <PaginationPrevious
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  />
                </PaginationItem>
                <div className="flex items-center gap-1">
                  {buildPageItems(safePage, totalPages).map((item, i) =>
                    item === "ellipsis" ? (
                      <span
                        key={`e${i}`}
                        className="px-1 text-[13px] text-tw-text-muted"
                      >
                        …
                      </span>
                    ) : (
                      <PaginationItem key={item}>
                        <PaginationLink
                          isActive={item === safePage}
                          onClick={() => setPage(item)}
                        >
                          {item}
                        </PaginationLink>
                      </PaginationItem>
                    )
                  )}
                </div>
                <PaginationItem>
                  <PaginationNext
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          )}

          <p className="mt-3 px-1 text-[12px] text-tw-text-muted">
            The active repository is the one Tripwire shows across rules,
            events, and insights.
          </p>
        </>
      )}
    </div>
  )
}
