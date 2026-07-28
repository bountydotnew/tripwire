import type { ReactNode } from "react"

interface RuleCardProps {
  title: ReactNode
  description: string
  enabled: boolean
  onToggle: (enabled: boolean) => void
  /** Jumps to the workflow editor for this rule. Hidden when omitted. */
  onEditInWorkflow?: () => void
  /** Opens the raw rule definition. Hidden when omitted. */
  onViewRaw?: () => void
}

export function RuleCard({
  title,
  description,
  enabled,
  onToggle,
  onEditInWorkflow,
  onViewRaw,
}: RuleCardProps) {
  return (
    <div className="relative flex flex-col gap-2 self-stretch overflow-clip rounded-[10px] border border-border border-solid bg-surface-2 p-1">
      <div className="flex items-center justify-between gap-1 px-3 py-1.5">
        <div className="font-medium text-[14px] text-text leading-[145%]">
          {title}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => onToggle(!enabled)}
          className={`flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent border-solid shadow-[#0000000D_0px_1px_2px] transition-colors ${
            enabled ? "bg-[#368CED]" : "bg-tw-button-muted"
          }`}
        >
          <span
            className={`h-4 w-4 shrink-0 rounded-full bg-white shadow-[#09090B_0px_0px_0px,#0000001A_0px_10px_15px_-3px,#0000001A_0px_4px_6px_-4px] transition-transform ${
              enabled ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-2 rounded-sm border border-border border-solid bg-surface-inset px-3 py-2">
        <p className="font-[450] text-text-muted text-xs leading-[162.5%]">
          {description}
        </p>

        {(onEditInWorkflow || onViewRaw) && (
          <div className="flex items-center justify-between self-stretch">
            {onEditInWorkflow ? (
              <button
                type="button"
                onClick={onEditInWorkflow}
                className="cursor-pointer font-medium text-text text-xs leading-[133.333%] transition-opacity hover:opacity-80"
              >
                edit in workflow →
              </button>
            ) : (
              <span />
            )}
            {onViewRaw && (
              <button
                type="button"
                onClick={onViewRaw}
                className="cursor-pointer font-[450] text-[11px] text-text-muted leading-[150%] transition-colors hover:text-text"
              >
                view raw
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
