import { cn } from "@tripwire/ui/utils"

export interface RadioOption<V extends string> {
  value: V
  label: string
  /** Small muted text inline after the label (e.g. "Coming soon"). */
  suffix?: string
  /** Second line below the label. */
  hint?: string
  disabled?: boolean
}

interface RadioRowProps<V extends string> {
  title: string
  description?: string
  options: ReadonlyArray<RadioOption<V>>
  value: V
  onValueChange: (next: V) => void
  disabled?: boolean
}

export function RadioRow<V extends string>({
  title,
  description,
  options,
  value,
  onValueChange,
  disabled,
}: RadioRowProps<V>) {
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
      <div className="mt-2 flex flex-col overflow-hidden rounded-lg border border-tw-border bg-tw-surface">
        {options.map((opt) => (
          <RadioRowItem
            key={opt.value}
            option={opt}
            selected={!opt.disabled && value === opt.value}
            disabled={disabled || opt.disabled}
            onSelect={() => {
              if (disabled || opt.disabled) return
              onValueChange(opt.value)
            }}
          />
        ))}
      </div>
    </div>
  )
}

interface RadioRowItemProps<V extends string> {
  option: RadioOption<V>
  selected: boolean
  disabled: boolean | undefined
  onSelect: () => void
}

function RadioRowItem<V extends string>({
  option,
  selected,
  disabled,
  onSelect,
}: RadioRowItemProps<V>) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-3 border-t border-tw-border px-3.5 py-3 transition-colors first:border-t-0",
        selected ? "bg-tw-hover-light" : "hover:bg-tw-hover",
        disabled && "cursor-not-allowed opacity-45 hover:bg-transparent"
      )}
    >
      <input
        type="radio"
        className="sr-only"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
      />
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-[13px] font-medium text-tw-text-primary">
          {option.label}
          {option.suffix ? (
            <span className="text-[12px] font-normal text-tw-text-tertiary">
              {option.suffix}
            </span>
          ) : null}
        </span>
        {option.hint ? (
          <span className="text-[12px] text-tw-text-muted">{option.hint}</span>
        ) : null}
      </div>
      <span
        className={cn(
          "relative size-[15px] shrink-0 rounded-full border-[1.5px] transition-colors",
          selected ? "border-tw-text-primary" : "border-tw-text-tertiary"
        )}
      >
        {selected ? (
          <span className="absolute inset-[3px] rounded-full bg-tw-text-primary" />
        ) : null}
      </span>
    </label>
  )
}
