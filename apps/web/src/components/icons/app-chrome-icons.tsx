import type * as React from "react"

/** 14×14 plus for toolbar buttons (stroke via currentColor) */
export function PlusStrokeIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
    >
      <path
        d="M7 3v8M3 7h8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** 11×11 compact plus */
export function PlusStrokeIcon11({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      className={className}
    >
      <path
        d="M5.5 1.5v8M1.5 5.5h8"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Simulate / play triangle 13×13 */
export function PlayTriangleIcon13({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M3 2l10 6-10 6V2Z" />
    </svg>
  )
}

/** Muted user circle for workflow “user” sim field */
export function UserCircleMutedIcon13({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
    >
      <path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5 7a5 5 0 0 0-10 0h10Z" />
    </svg>
  )
}

/** Empty-state workflows zap (muted fill) */
export function WorkflowsEmptyZapIcon32(): React.ReactElement {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 16 16"
      fill="#FFFFFF20"
      aria-hidden
    >
      <path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
    </svg>
  )
}

/** Pending-changes toolbar */
export function SmallPlusStrokeIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M6 1v10M1 6h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function SmallCheckStrokeIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M2.5 6L5 8.5L9.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SmallXStrokeIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M3 3l6 6M9 3l-6 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Bootstrap-style search loupe (filled) for toolbox */
export function ToolboxSearchLoupeIcon13(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 16 16"
      className="text-[#6E6E6E]"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001q.044.06.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1 1 0 0 0-.115-.1ZM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0Z"
      />
    </svg>
  )
}

/** Rule builder dropdown chevron */
export function DropdownChevronDownIcon10(): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      style={{ flexShrink: 0 }}
      aria-hidden
    >
      <path
        d="M6 9l6 6 6-6"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function StrokeXIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M11 3L3 11M3 3L11 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function StrokeXIcon10Muted({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={className ?? "text-[#9F9FA9]"}
      aria-hidden
    >
      <path
        d="M7.5 2.5L2.5 7.5M2.5 2.5L7.5 7.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChatBubbleOutlineIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M2.5 3.5C2.5 2.67 3.17 2 4 2h4c.83 0 1.5.67 1.5 1.5v3c0 .83-.67 1.5-1.5 1.5H5.5L3.5 10V8H4c-.83 0-1.5-.67-1.5-1.5v-3Z"
        stroke="currentColor"
        strokeWidth="1"
      />
    </svg>
  )
}

export function SaveBarSuccessCheckIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M2.2 6.2 4.75 8.45 9.8 3.55"
        stroke="currentColor"
        strokeWidth="1.55"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SuccessCheckStrokeIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M3 7L6 10L11 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function DragHandleDotsIcon8(): React.ReactElement {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden>
      <circle cx="2" cy="2" r="1" />
      <circle cx="6" cy="2" r="1" />
      <circle cx="2" cy="6" r="1" />
      <circle cx="6" cy="6" r="1" />
    </svg>
  )
}

/** Back / nav — chevron left 14×14 */
export function ChevronLeftStrokeIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 3L5 7L9 11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Plus for empty-state / template cards (muted stroke + group-hover via className on path unavailable — use group-hover:text-tw-accent on parent + currentColor if needed) */
export function PlusStrokeIcon18({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M9 4v10M4 9h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Workflow list zap glyph (fill) */
export function WorkflowZapFillIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
    </svg>
  )
}

export function OnboardingCheckCircleIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.5 7L6.5 9L9.5 5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SessionMonitorIcon16({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <rect
        x="2"
        y="3"
        width="12"
        height="9"
        rx="1.5"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5 14h6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ChevronRightIndicatorIcon12({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M4.5 3L7.5 6L4.5 9"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function SearchLoupeOutlineIcon14({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      className={className}
      aria-hidden
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path
        d="M10.5 10.5L13.5 13.5"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MenuChevronDownIcon10({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M2.5 4L5 6.5L7.5 4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
