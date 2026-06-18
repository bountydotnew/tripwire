import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { cn } from "@tripwire/ui/utils"
import { ViewPill } from "./view-pill"

interface ToggleRowProps {
  title: string
  description?: string
  checked: boolean
  onCheckedChange: (next: boolean) => void
  disabled?: boolean
  /** When set, renders a View pill next to the title; click invokes onViewClick. */
  onViewClick?: () => void
}

export function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
  disabled,
  onViewClick,
}: ToggleRowProps) {
  return (
    <div className="flex flex-col gap-1 border-t border-tw-border px-5 py-4 first:border-t-0">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 items-center gap-2.5 min-w-0">
          <span className="text-[14px] font-medium tracking-[-0.005em] text-tw-text-primary">
            {title}
          </span>
          {onViewClick ? <ViewPill onClick={onViewClick} /> : null}
        </div>
        <SwitchPrimitive.Root
          checked={checked}
          onCheckedChange={onCheckedChange}
          disabled={disabled}
          className={cn(
            "relative h-5 w-[34px] shrink-0 cursor-pointer rounded-full bg-tw-border transition-colors",
            "data-[checked]:bg-tw-text-primary",
            "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tw-accent/40"
          )}
          aria-label={title}
        >
          <SwitchPrimitive.Thumb
            className={cn(
              "absolute top-[3px] left-[3px] size-3.5 rounded-full bg-tw-text-tertiary transition-transform",
              "data-[checked]:translate-x-[14px] data-[checked]:bg-tw-bg"
            )}
          />
        </SwitchPrimitive.Root>
      </div>
      {description ? (
        <p className="text-[13px] leading-snug text-tw-text-muted">
          {description}
        </p>
      ) : null}
    </div>
  )
}
