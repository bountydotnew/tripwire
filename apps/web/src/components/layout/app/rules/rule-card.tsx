import type { ReactNode } from "react"
import { Button } from "@tripwire/ui/button"

interface RuleCardProps {
  title: ReactNode
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
}

export function RuleCard({
  title,
  description,
  enabled,
  onToggle,
}: RuleCardProps) {
  return (
    <div className="flex w-full items-center justify-between rounded-xl border border-tw-border-card bg-tw-card p-3">
      <div className="mr-4 flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="text-base leading-5 font-medium tracking-[-0.02em] text-white">
          {title}
        </div>
        <div className="text-xs leading-4 text-tw-text-secondary">
          {description}
        </div>
      </div>
      <Button
        variant="ghost"
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => onToggle(!enabled)}
        className={`relative w-10 shrink-0 cursor-pointer rounded-[11px] border-none transition-colors ${
          enabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"
        }`}
      >
        <div
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-[9px] transition-all ${
            enabled ? "right-0.5 bg-white" : "left-0.5 bg-[#FFFFFF59]"
          }`}
        />
      </Button>
    </div>
  )
}
