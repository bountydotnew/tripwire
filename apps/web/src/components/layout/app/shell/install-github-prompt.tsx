import { Link } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"
import { Button } from "@tripwire/ui/button"
import { GithubIcon } from "@tripwire/ui/icons/github"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { routes } from "#/lib/routes"
import { useRefreshOnReturn } from "#/lib/use-refresh-on-return"

export function InstallGitHubPrompt() {
  const queryClient = useQueryClient()
  // Re-fetch every query when the user returns from clicking through to
  // GitHub's install flow — by the time they're back here, the
  // installation webhook has (probably) arrived and the workspace repo
  // list should change.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries()
  }, [queryClient])
  useRefreshOnReturn({ refresh })

  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-4 px-4 text-center">
        <div className="flex size-12 items-center justify-center">
          <TripwireLogo className="size-8 text-tw-text-secondary" />
        </div>
        <div>
          <h2 className="mb-1 text-[15px] font-medium text-tw-text-primary">
            Install the GitHub App
          </h2>
          <p className="text-[13px] leading-relaxed text-tw-text-secondary">
            Connect a repository to start using Tripwire. You'll be able to
            configure rules, run automations, and monitor contributions.
          </p>
        </div>
        <Button variant="default" size="sm">
          <Link to={routes.api.githubInstall} className="flex gap-2">
            <GithubIcon className="mt-0.5 size-4" />
            Install GitHub App
          </Link>
        </Button>
      </div>
    </div>
  )
}
