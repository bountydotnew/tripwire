import { cn } from "@tripwire/ui/utils"

interface TextareaRowProps {
  title: string
  description?: string
  value: string
  onValueChange: (next: string) => void
  placeholder?: string
  maxLength?: number
  rows?: number
  disabled?: boolean
}

export function TextareaRow({
  title,
  description,
  value,
  onValueChange,
  placeholder,
  maxLength,
  rows = 3,
  disabled,
}: TextareaRowProps) {
  return (
    <div className="flex flex-col gap-1 border-t border-tw-border px-5 py-4 first:border-t-0">
      <span className="text-[14px] font-medium tracking-[-0.005em] text-tw-text-primary">
        {title}
      </span>
      {description ? (
        <p className="text-[13px] leading-snug text-tw-text-muted">
          {description}
        </p>
      ) : null}
      <textarea
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={rows}
        disabled={disabled}
        className={cn(
          "mt-2 w-full resize-y rounded-lg border border-tw-border bg-tw-surface px-3 py-2 text-[13px] leading-snug text-tw-text-primary",
          "placeholder:text-tw-text-tertiary",
          "transition-colors hover:bg-tw-hover",
          "focus:border-tw-accent focus:bg-tw-surface focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  )
}
