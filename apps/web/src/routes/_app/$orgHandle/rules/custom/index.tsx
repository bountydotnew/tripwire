import { createFileRoute, Link } from "@tanstack/react-router"
import { CustomRulesTab } from "#/components/layout/app/rules/custom/custom-rules-tab"
import { useWorkspace } from "#/providers/workspace-context"
import { EmptyState } from "#/components/shared/empty-state"
import { env } from "@tripwire/env/client"

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/")({
  component: CustomRulesHubPage,
})

function CustomRulesHubPage() {
  const { orgHandle } = Route.useParams()
  const { repo, repos, isLoading } = useWorkspace()
  const githubAppSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-app"
  const allRulesPath: string = `/${orgHandle}/rules`

  if (!isLoading && repos.length === 0) {
    return (
      <EmptyState
        title="Install the Tripwire GitHub App"
        description="Connect your GitHub repositories to use custom rules."
        action={{
          label: "Install GitHub App",
          href: `https://github.com/apps/${githubAppSlug}/installations/new`,
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 md:px-[50px] md:py-10">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-white/5" />
        <div className="h-[200px] animate-pulse rounded-xl bg-white/5" />
      </div>
    )
  }

  if (!repo?.id) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-4 py-8 md:px-[50px] md:py-10">
        <Link
          to={allRulesPath}
          className="w-fit text-[13px] text-[#FFFFFF99] transition-colors hover:text-white"
        >
          ← All rules
        </Link>
        <p className="text-sm text-tw-text-muted">Select a repository first.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 md:px-[50px] md:py-10">
      <div className="flex flex-col gap-1">
        <Link
          to={allRulesPath}
          className="mb-1 w-fit text-[13px] text-[#FFFFFF99] transition-colors hover:text-white"
        >
          ← All rules
        </Link>
        <h1 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.02em] text-white">
          Custom rules
        </h1>
        <p className="m-0 max-w-xl text-[13px] text-[#FFFFFF73]">
          Build repo-specific flows with the visual rule editor. Create,
          simulate, then enable.
        </p>
      </div>
      <CustomRulesTab repoId={repo.id} orgHandle={orgHandle} />
    </div>
  )
}
