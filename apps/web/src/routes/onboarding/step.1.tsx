import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { StepShell } from "#/components/layout/onboarding/step-shell"
import { toastFromError } from "#/lib/toast-error"

export const Route = createFileRoute("/onboarding/step/1")({
  component: Step1Page,
})

interface BulletProps {
  children: React.ReactNode
}

function Step1Page() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const complete = useMutation(
    trpc.onboarding.completeStep.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.onboarding.getState.queryKey(),
        })
        navigate({ to: "/onboarding/step/2" })
      },
      onError: (err) => toastFromError(err, { fallbackTitle: "Couldn't continue" }),
    })
  )

  return (
    <StepShell
      step={1}
      totalSteps={4}
      title="Welcome to Tripwire"
      subtitle="Stop bot PRs, spam issues, and takeover attempts before they touch your repo."
      primaryLabel="Get started"
      primaryLoading={complete.isPending}
      onPrimary={() => complete.mutate({ step: 1 })}
    >
      <ul className="flex flex-col gap-3 text-[13px] text-tw-text-secondary">
        <Bullet>
          Score every contributor against their GitHub history before they hit
          your repo.
        </Bullet>
        <Bullet>
          Whitelist trusted folks, blacklist bad actors, and let the rest go
          through your rule pipeline.
        </Bullet>
        <Bullet>
          Backfill historical PRs and issues so the dashboard's useful from
          day one.
        </Bullet>
      </ul>
    </StepShell>
  )
}

function Bullet({ children }: BulletProps) {
  return (
    <li className="flex items-start gap-2.5">
      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-tw-text-tertiary" />
      <span className="leading-5">{children}</span>
    </li>
  )
}
