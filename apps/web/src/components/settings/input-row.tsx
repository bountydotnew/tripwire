import { cn } from "@tripwire/ui/utils"

interface InputRowProps {
  title: string
  description?: string
  /** Small muted text rendered next to the title (e.g. "Coming soon"). */
  meta?: string
  value: string
  onValueChange: (next: string) => void
  placeholder?: string
  maxLength?: number
  disabled?: boolean
  type?: "text" | "url"
}

export function InputRow({
  title,
  description,
  meta,
  value,
  onValueChange,
  placeholder,
  maxLength,
  disabled,
  type = "text",
}: InputRowProps) {
  return (
    <div className="flex flex-col gap-1 border-t border-tw-border px-5 py-4 first:border-t-0">
      <div className="flex items-baseline gap-2">
        <span className="text-[14px] font-medium tracking-[-0.005em] text-tw-text-primary">
          {title}
        </span>
        {meta ? (
          <span className="text-[12px] text-tw-text-tertiary">{meta}</span>
        ) : null}
      </div>
      {description ? (
        <p className="text-[13px] leading-snug text-tw-text-muted">
          {description}
        </p>
      ) : null}
      <input
        type={type}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
        className={cn(
          "mt-2 w-full rounded-lg border border-tw-border bg-tw-surface px-3 py-2 text-[13px] text-tw-text-primary",
          "placeholder:text-tw-text-tertiary",
          "transition-colors hover:bg-tw-hover",
          "focus:border-tw-accent focus:bg-tw-surface focus:outline-none",
          "disabled:cursor-not-allowed disabled:opacity-50"
        )}
      />
    </div>
  )
}
