import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { StepShell } from "#/components/layout/onboarding/step-shell"
import { toastFromError } from "#/lib/toast-error"
import { Checkbox } from "@tripwire/ui/checkbox"
import { Button } from "@tripwire/ui/button"

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

interface PillsProps<T extends string> {
  options: { value: T; label: string }[]
  value: T | null
  onChange: (v: T) => void
}

type UseCase =
  | "ai_prs"
  | "crypto_bots"
  | "spam_issues"
  | "takeover_attempts"
  | "vouched_only"
  | "other"

type TeamSize = "solo" | "small" | "medium" | "large"

type Source = "twitter" | "github" | "friend" | "hacker_news" | "other"

const USE_CASES: { value: UseCase; label: string }[] = [
  { value: "ai_prs", label: "AI-generated PRs" },
  { value: "crypto_bots", label: "Crypto-address spam bots" },
  { value: "spam_issues", label: "Spam issues" },
  { value: "takeover_attempts", label: "Hostile takeover attempts" },
  { value: "vouched_only", label: "Vouched-only contributor access" },
  { value: "other", label: "Something else" },
]

const TEAM_SIZES: { value: TeamSize; label: string }[] = [
  { value: "solo", label: "Just me" },
  { value: "small", label: "2–5" },
  { value: "medium", label: "6–20" },
  { value: "large", label: "20+" },
]

const SOURCES: { value: Source; label: string }[] = [
  { value: "twitter", label: "Twitter" },
  { value: "github", label: "GitHub" },
  { value: "friend", label: "Friend" },
  { value: "hacker_news", label: "Hacker News" },
  { value: "other", label: "Somewhere else" },
]

export function OnboardingStep3Page() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [useCases, setUseCases] = useState<UseCase[]>([])
  const [teamSize, setTeamSize] = useState<TeamSize | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const [priorIncident, setPriorIncident] = useState("")

  const mutation = useMutation(
    trpc.onboarding.saveSetupAnswers.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries({
          queryKey: trpc.onboarding.getState.queryKey(),
        })
        navigate({ to: "/onboarding/step/4" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't save your answers" }),
    })
  )

  const toggleUseCase = (v: UseCase) => {
    setUseCases((prev) =>
      prev.includes(v) ? prev.filter((u) => u !== v) : [...prev, v]
    )
  }

  return (
    <StepShell
      step={3}
      totalSteps={4}
      title="Tell us about your setup"
      subtitle="We'll use this to highlight the right rules and shortcuts for you. None of it's required."
      primaryLabel="Continue"
      primaryLoading={mutation.isPending}
      onPrimary={() =>
        mutation.mutate({
          useCases,
          priorIncident: priorIncident.trim() || null,
          teamSize,
          source: source ?? undefined,
        })
      }
      secondaryLabel="Skip"
      onSecondary={() => navigate({ to: "/onboarding/step/4" })}
    >
      <Field label="What are you trying to stop?" hint="Pick as many as apply.">
        <div className="flex flex-col gap-1.5">
          {USE_CASES.map((u) => {
            const checked = useCases.includes(u.value)
            return (
              <label
                key={u.value}
                className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-tw-hover"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggleUseCase(u.value)}
                />
                <span className="text-[13px] text-tw-text-primary">
                  {u.label}
                </span>
              </label>
            )
          })}
        </div>
      </Field>

      <Field label="Team size">
        <Pills
          options={TEAM_SIZES}
          value={teamSize}
          onChange={(v) => setTeamSize(v)}
        />
      </Field>

      <Field label="How'd you hear about us?">
        <Pills
          options={SOURCES}
          value={source}
          onChange={(v) => setSource(v)}
        />
      </Field>

      <Field
        label="Anything that brought you here today?"
        hint="Optional. A recent incident, a specific concern, whatever."
      >
        <textarea
          value={priorIncident}
          onChange={(e) => setPriorIncident(e.target.value)}
          rows={3}
          placeholder="Optional"
          className="w-full resize-none rounded-md border border-tw-border bg-tw-inner px-2.5 py-2 text-[13px] text-tw-text-primary placeholder:text-tw-text-muted focus:border-tw-text-tertiary focus:outline-none"
        />
      </Field>
    </StepShell>
  )
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-tw-text-primary">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] text-tw-text-muted">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function Pills<T extends string>({ options, value, onChange }: PillsProps<T>) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <Button
          key={o.value}
          variant="ghost"
          size="xs"
          onClick={() => onChange(o.value)}
          className={`h-7 rounded-full border px-3 text-[12px] font-medium transition-colors ${
            value === o.value
              ? "border-tw-accent/40 bg-tw-accent/10 text-tw-text-primary"
              : "border-tw-border bg-tw-inner text-tw-text-secondary hover:border-tw-text-tertiary"
          }`}
        >
          {o.label}
        </Button>
      ))}
    </div>
  )
}
