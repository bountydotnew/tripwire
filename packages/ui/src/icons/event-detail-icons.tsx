import type * as React from "react"

export function EventPageExternalLinkIcon11({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      className={className}
      width="11"
      height="11"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 2.5h-2A1.5 1.5 0 0 0 1 4v5.5A1.5 1.5 0 0 0 2.5 11H8a1.5 1.5 0 0 0 1.5-1.5v-2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M7 1h4v4M11 1 5.5 6.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EventIssueDotCircleIcon12({
  color,
}: {
  color: string
}): React.ReactElement {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
      <circle cx="6" cy="6" r="4.5" stroke={color} strokeWidth="1.3" />
      <circle cx="6" cy="6" r="1.3" fill={color} />
    </svg>
  )
}

export function EventShieldStrokeIcon14(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L4 5V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V5L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EventShieldCheckStrokeIcon14(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2L4 5V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V5L12 2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M8.75 12L11 14.25L15.25 10"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function EventUserPlusStrokeIcon14(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="9" cy="8" r="3.25" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M3.5 19.5C3.5 16.46 5.96 14 9 14C12.04 14 14.5 16.46 14.5 19.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M18.5 8.5V14.5M21.5 11.5H15.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function EventRuleResultGlyph({
  result,
}: {
  result: string
}): React.ReactElement {
  if (result === "blocked" || result === "flagged") {
    const color = result === "blocked" ? "#F56D5D" : "#D1BC00"
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M13.998 21.75C16.253 21.75 18.033 21.75 19.352 21.554C20.69 21.354 21.776 20.922 22.376 19.863C22.975 18.806 22.79 17.65 22.276 16.395C21.772 15.161 20.866 13.633 19.717 11.696L19.669 11.616L17.744 8.371L17.698 8.293C16.596 6.434 15.723 4.963 14.911 3.965C14.083 2.946 13.184 2.25 12 2.25C10.816 2.25 9.917 2.946 9.089 3.965C8.277 4.963 7.405 6.434 6.303 8.293L6.256 8.371L4.331 11.616L4.283 11.696C3.135 13.633 2.228 15.161 1.724 16.395C1.21 17.65 1.025 18.806 1.624 19.863C2.224 20.922 3.31 21.354 4.648 21.554C5.967 21.75 7.747 21.75 10.002 21.75L13.998 21.75ZM12 10.25C11.448 10.25 11 9.802 11 9.25C11 8.698 11.448 8.25 12 8.25C12.552 8.25 13 8.698 13 9.25C13 9.802 12.552 10.25 12 10.25ZM12 18C11.448 18 11 17.552 11 17L11 13C11 12.448 11.448 12 12 12C12.552 12 13 12.448 13 13L13 17C13 17.552 12.552 18 12 18Z"
          fill={color}
        />
      </svg>
    )
  }
  if (result === "passed") {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="#67E19F"
        aria-hidden
      >
        <circle cx="8" cy="8" r="8" />
        <path
          d="M5 8L7 10L11 6"
          stroke="#0D0D0F"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </svg>
    )
  }
  return (
    <span className="flex h-4 w-4 items-center justify-center">
      <span className="h-[2px] w-2 bg-tw-text-tertiary" />
    </span>
  )
}
