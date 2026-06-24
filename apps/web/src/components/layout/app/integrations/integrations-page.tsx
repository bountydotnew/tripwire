import { useQueryClient, useQuery } from "@tanstack/react-query"
import { useCallback } from "react"
import { Button } from "@tripwire/ui/button"
import { SuccessCheckStrokeIcon14 } from "@tripwire/ui/icons/app-chrome-icons"
import { GitHubMarkWhiteIcon20 } from "@tripwire/ui/icons/github-mark-icon"
import { useWorkspace } from "#/providers/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import { routes } from "#/lib/routes"
import { useRefreshOnReturn } from "#/lib/use-refresh-on-return"

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

      <div className="mb-2 text-[11px] font-medium tracking-wider text-tw-text-muted uppercase">
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
              <Button
                size="xs"
                variant="outline"
                className="shrink-0"
                render={
                  <a
                    href={installHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Manage
                  </a>
                }
              />
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

      {isConnected && (
        <>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[11px] font-medium tracking-wider text-tw-text-muted uppercase">
              Active repository
            </span>
            <span className="text-[11px] text-tw-text-muted">
              {repos.length} connected
            </span>
          </div>
          <div className="rounded-xl border border-tw-border bg-tw-card p-1.5">
            {isLoading ? (
              <div className="py-4 text-center text-sm text-tw-text-muted">
                Loading repositories…
              </div>
            ) : repos.length === 0 ? (
              <div className="px-3 py-4 text-[13px] text-tw-text-muted">
                This account has no repositories with the Tripwire App
                installed yet. Use Manage to grant repository access.
              </div>
            ) : (
              <div className="flex flex-col">
                {repos.map((r) => {
                  const isSelected = repo?.id === r.id
                  return (
                    <Button
                      variant="ghost"
                      key={r.id}
                      type="button"
                      onClick={() => setRepo(r)}
                      className={`w-full cursor-pointer justify-between rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        isSelected
                          ? "bg-tw-hover text-tw-text-primary"
                          : "text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text-primary"
                      }`}
                    >
                      <span className="truncate font-mono text-[13px]">
                        {r.fullName}
                      </span>
                      {isSelected && (
                        <SuccessCheckStrokeIcon14 className="shrink-0 text-tw-success" />
                      )}
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
          <p className="mt-2 px-1 text-[12px] text-tw-text-muted">
            The active repository is the one Tripwire shows across rules,
            events, and insights.
          </p>
        </>
      )}
    </div>
  )
}
