import { cn } from "@tripwire/ui/utils"

interface ViewPillProps {
  onClick?: () => void
  className?: string
  label?: string
}

/**
 * Small button that anchors to a related preview card. Matches the
 * "View" pattern in CodeRabbit's settings: filled eye icon on a
 * subtle elevated background, no border, slightly rounded.
 */
export function ViewPill({ onClick, className, label = "View" }: ViewPillProps) {
  return (
    // biome-ignore lint/correctness/noRestrictedElements: native button is correct here; AsChild not needed.
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-[5px] bg-tw-hover-light px-[7px]",
        "text-[12px] font-medium text-tw-text-primary",
        "transition-colors hover:bg-tw-border active:bg-tw-hover",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tw-accent/40",
        className
      )}
    >
      <EyeIcon />
      {label}
    </button>
  )
}

function EyeIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
      <path
        fillRule="evenodd"
        d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 0 1 0-1.113ZM17.25 12a5.25 5.25 0 1 1-10.5 0 5.25 5.25 0 0 1 10.5 0Z"
        clipRule="evenodd"
      />
    </svg>
  )
}
