import { createFileRoute } from "@tanstack/react-router"
import { useWorkspace } from "#/lib/workspace-context"
import { Button } from "#/components/ui/button"
import { routes } from "#/lib/routes"
import { GitHubMarkWhiteIcon20 } from "#/components/icons/github-mark-icon"
import { SuccessCheckStrokeIcon14 } from "#/components/icons/app-chrome-icons"

export const Route = createFileRoute("/_app/$orgHandle/integrations")({
  component: IntegrationsPage,
})

function IntegrationsPage() {
  const { repos, repo, setRepo, isLoading } = useWorkspace()

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="mb-1 text-xl font-semibold text-tw-text-primary">
        Integrations
      </h1>
      <p className="mb-6 text-sm text-tw-text-secondary">
        Connect repositories and manage your GitHub integration.
      </p>

      {/* GitHub App Section */}
      <div className="mb-6 rounded-xl p-5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg">
              <GitHubMarkWhiteIcon20 />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[14px] font-medium text-tw-text-primary">
                {repos.length > 0
                  ? "Tripwire GitHub App"
                  : "Install the Tripwire GitHub App"}
              </div>
              <div className="text-[12px] leading-snug text-tw-text-muted">
                {repos.length > 0
                  ? `${repos.length} repo${repos.length === 1 ? "" : "s"} connected`
                  : "Connect your GitHub repositories to start protecting them from spam PRs, bot accounts, and AI-generated contributions."}
              </div>
            </div>
          </div>
          <Button
            size="xs"
            variant="outline"
            className="shrink-0 border-[#CDCDCD] bg-white text-black hover:bg-white/90"
            render={
              <a
                href={routes.api.githubInstall}
                target="_blank"
                rel="noopener noreferrer"
              >
                {repos.length > 0 ? "Manage" : "Install"}
              </a>
            }
          />
        </div>
      </div>

      {/* Repo Picker */}
      {repos.length > 0 && (
        <div className="rounded-xl bg-tw-card p-4">
          <div className="mb-3 text-sm font-medium text-tw-text-primary">
            Select Repository
          </div>

          {isLoading ? (
            <div className="py-4 text-center text-sm text-tw-text-muted">
              Loading repositories...
            </div>
          ) : (
            <div className="space-y-1">
              {repos.map((r) => {
                const isSelected = repo?.id === r.id
                return (
                  <Button
                    variant="ghost"
                    key={r.id}
                    type="button"
                    onClick={() => setRepo(r)}
                    className={`w-full cursor-pointer rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                      isSelected
                        ? "bg-tw-hover text-tw-text-primary"
                        : "text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text-primary"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{r.fullName}</span>
                      {isSelected && (
                        <SuccessCheckStrokeIcon14 className="text-tw-success" />
                      )}
                    </div>
                  </Button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
