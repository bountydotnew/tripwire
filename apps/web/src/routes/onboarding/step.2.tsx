import { useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { StepShell } from "#/components/layout/onboarding/step-shell"
import { toastFromError } from "#/lib/toast-error"
import { routes } from "#/lib/routes"
import { Button } from "@tripwire/ui/button"

export const Route = createFileRoute("/onboarding/step/2")({
  component: Step2Page,
})

interface RepoOptionProps {
  fullName: string
  selected: boolean
  onClick: () => void
}

function Step2Page() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const reposQuery = useQuery(trpc.orgs.myRepos.queryOptions())
  const mutation = useMutation(
    trpc.onboarding.setMainRepo.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.onboarding.getState.queryKey(),
        })
        navigate({ to: "/onboarding/step/3" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't save main repo" }),
    })
  )

  const repos = reposQuery.data ?? []
  const loading = reposQuery.isLoading

  if (!loading && repos.length === 0) {
    return <NoReposState />
  }

  return (
    <StepShell
      step={2}
      totalSteps={4}
      title="Pick your main repo"
      subtitle="We'll backfill its history so Visibility is populated when you land. You can sync others later."
      primaryLabel="Continue"
      primaryDisabled={!selectedId || mutation.isPending}
      primaryLoading={mutation.isPending}
      onPrimary={() =>
        selectedId && mutation.mutate({ repoId: selectedId })
      }
      secondaryLabel="Skip for now"
      onSecondary={() => navigate({ to: "/onboarding/step/3" })}
    >
      {loading ? (
        <RepoListSkeleton />
      ) : (
        <div className="flex max-h-[280px] flex-col gap-1 overflow-y-auto">
          {repos.map((repo) => (
            <RepoOption
              key={repo.id}
              fullName={repo.fullName}
              selected={repo.id === selectedId}
              onClick={() => setSelectedId(repo.id)}
            />
          ))}
        </div>
      )}
    </StepShell>
  )
}

function RepoOption({ fullName, selected, onClick }: RepoOptionProps) {
  return (
    <Button
      variant="ghost"
      onClick={onClick}
      className={`flex h-auto items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
        selected
          ? "border-tw-accent/40 bg-tw-accent/10"
          : "border-transparent hover:border-tw-border hover:bg-tw-hover"
      }`}
    >
      <span className="truncate text-[13px] font-medium text-tw-text-primary">
        {fullName}
      </span>
      <span
        className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
          selected
            ? "border-tw-accent bg-tw-accent"
            : "border-tw-border"
        }`}
      >
        {selected ? (
          <span className="size-1.5 rounded-full bg-white" />
        ) : null}
      </span>
    </Button>
  )
}

function RepoListSkeleton() {
  return (
    <div className="flex flex-col gap-1">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-11 w-full animate-pulse rounded-lg bg-tw-inner"
        />
      ))}
    </div>
  )
}

function NoReposState() {
  return (
    <div className="flex w-full flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          Install Tripwire on a repo
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          You haven't connected a GitHub repository yet. Install the GitHub App
          to get started.
        </p>
      </div>
      <div className="flex flex-col gap-4 rounded-2xl border border-tw-border bg-tw-card p-5 text-[13px] text-tw-text-secondary">
        Tripwire needs access to a repo before we can backfill its history.
      </div>
      <div className="flex items-center justify-end">
        <Button variant="default" size="sm" render={<a href={routes.api.githubInstall}>Install GitHub App</a>} />
      </div>
    </div>
  )
}
