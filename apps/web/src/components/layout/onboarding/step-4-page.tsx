import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { StepShell } from "#/components/layout/onboarding/step-shell"
import { toastFromError } from "#/lib/toast-error"
import { Spinner } from "@tripwire/ui/spinner"

interface SyncStatusRowProps {
  status: string | undefined
  itemsProcessed: number
  eventsInserted: number
  contributors: number
}

interface RowProps {
  tone: "running" | "success" | "error"
  label: string
  children: React.ReactNode
}

interface NextItemProps {
  children: React.ReactNode
}

export function OnboardingStep4Page() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const stateQuery = useQuery(trpc.onboarding.getState.queryOptions())
  const mainRepoId = stateQuery.data?.mainRepoId ?? null

  const repoQuery = useQuery({
    ...trpc.orgs.myRepos.queryOptions(),
    enabled: !!mainRepoId,
  })
  const mainRepo = repoQuery.data?.find((r) => r.id === mainRepoId) ?? null

  const syncQuery = useQuery(
    trpc.visibility.syncStatus.queryOptions(
      { repoId: mainRepoId ?? "" },
      {
        enabled: !!mainRepoId,
        refetchInterval: (q) => {
          const status = q.state.data?.lastRun?.status
          return status === "queued" || status === "running" ? 3000 : false
        },
      }
    )
  )

  const complete = useMutation(
    trpc.onboarding.completeStep.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.onboarding.getState.queryKey(),
        })
        if (mainRepo?.orgName) {
          navigate({
            to: "/$orgHandle/visibility",
            params: { orgHandle: mainRepo.orgName },
          })
        } else {
          navigate({ to: "/" })
        }
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't finish onboarding" }),
    })
  )

  const status = syncQuery.data?.lastRun?.status
  const stats = syncQuery.data?.lastRun?.stats
  const itemsProcessed = stats ? stats.prs + stats.issues : 0

  return (
    <StepShell
      step={4}
      totalSteps={4}
      title="You're all set"
      subtitle={
        mainRepo
          ? `We're backfilling ${mainRepo.fullName} in the background. The dashboard is ready to use.`
          : "The dashboard is ready to use."
      }
      primaryLabel="Take me to Visibility"
      primaryLoading={complete.isPending}
      onPrimary={() => complete.mutate({ step: 4 })}
    >
      {mainRepoId ? (
        <SyncStatusRow
          status={status}
          itemsProcessed={itemsProcessed}
          eventsInserted={stats?.eventsInserted ?? 0}
          contributors={stats?.contributors ?? 0}
        />
      ) : (
        <div className="text-[13px] text-tw-text-secondary">
          No main repo selected. You can sync any repo later from the Visibility
          tab.
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-tw-border pt-4">
        <span className="text-[12px] font-medium tracking-wide text-tw-text-muted uppercase">
          What's next
        </span>
        <ul className="flex flex-col gap-2 text-[13px] text-tw-text-secondary">
          <NextItem>
            Review <strong className="text-tw-text-primary">Visibility</strong>{" "}
            to see contributors and quick whitelist actions.
          </NextItem>
          <NextItem>
            Configure your{" "}
            <strong className="text-tw-text-primary">Rules</strong> so the
            pipeline knows what to block.
          </NextItem>
          <NextItem>
            Watch the <strong className="text-tw-text-primary">Events</strong>{" "}
            feed when PRs and issues start flowing.
          </NextItem>
        </ul>
      </div>
    </StepShell>
  )
}

function SyncStatusRow({
  status,
  itemsProcessed,
  eventsInserted,
  contributors,
}: SyncStatusRowProps) {
  if (status === "completed") {
    return (
      <Row tone="success" label="Backfill complete">
        {eventsInserted} events · {contributors} contributors
      </Row>
    )
  }
  if (status === "errored") {
    return (
      <Row tone="error" label="Backfill failed">
        We'll retry on your next sync.
      </Row>
    )
  }
  if (status === "queued" || status === "running") {
    return (
      <Row tone="running" label="Backfilling your repo">
        {itemsProcessed > 0
          ? `${itemsProcessed} items processed`
          : "Fetching from GitHub…"}
      </Row>
    )
  }
  return (
    <Row tone="running" label="Starting backfill">
      Hang tight — this kicks off in a moment.
    </Row>
  )
}

function Row({ tone, label, children }: RowProps) {
  const accent =
    tone === "success"
      ? "text-tw-success"
      : tone === "error"
        ? "text-tw-error"
        : "text-tw-text-primary"
  return (
    <div className="flex items-start gap-3 rounded-xl bg-tw-inner px-3 py-2.5">
      {tone === "running" ? (
        <Spinner className="size-3.5 shrink-0 text-tw-text-secondary" />
      ) : (
        <span
          className={`mt-1 size-1.5 shrink-0 rounded-full ${
            tone === "success" ? "bg-tw-success" : "bg-tw-error"
          }`}
        />
      )}
      <div className="flex flex-col gap-0.5">
        <span className={`text-[13px] font-medium ${accent}`}>{label}</span>
        <span className="text-[11px] text-tw-text-muted">{children}</span>
      </div>
    </div>
  )
}

function NextItem({ children }: NextItemProps) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-tw-text-tertiary" />
      <span className="leading-5">{children}</span>
    </li>
  )
}
