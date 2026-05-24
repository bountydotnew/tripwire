import { Button } from "@tripwire/ui/button"

interface StepShellProps {
  step: 1 | 2 | 3 | 4
  totalSteps: number
  title: string
  subtitle: string
  children: React.ReactNode
  primaryLabel: string
  onPrimary: () => void
  primaryDisabled?: boolean
  primaryLoading?: boolean
  secondaryLabel?: string
  onSecondary?: () => void
}

export function StepShell({
  step,
  totalSteps,
  title,
  subtitle,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  secondaryLabel,
  onSecondary,
}: StepShellProps) {
  return (
    <div className="flex w-full flex-col gap-6">
      <StepDots step={step} totalSteps={totalSteps} />

      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          {title}
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          {subtitle}
        </p>
      </div>

      <div className="flex flex-col gap-4 rounded-2xl border border-tw-border bg-tw-card p-5">
        {children}
      </div>

      <div className="flex items-center justify-end gap-2">
        {secondaryLabel && onSecondary ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSecondary}
            className="text-tw-text-muted hover:text-tw-text-secondary"
          >
            {secondaryLabel}
          </Button>
        ) : null}
        <Button
          variant="default"
          size="sm"
          loading={primaryLoading}
          disabled={primaryDisabled}
          onClick={onPrimary}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  )
}

function StepDots({ step, totalSteps }: { step: number; totalSteps: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: totalSteps }, (_, i) => i + 1).map((n) => (
        <span
          key={n}
          className={`h-1 flex-1 rounded-full transition-colors ${
            n <= step ? "bg-tw-text-primary" : "bg-tw-border"
          }`}
        />
      ))}
    </div>
  )
}
