import type * as React from "react"

export function PeopleSearchLoupeIcon16(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="#9a9a9a" strokeWidth="1.3" />
      <path
        d="M10.5 10.5L13.5 13.5"
        stroke="#9a9a9a"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ContributorSuggestionCheckIcon14(): React.ReactElement {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="6" stroke="#9F9FA9" strokeWidth="1.2" />
      <path
        d="M4 7L6 9L10 5"
        stroke="#9F9FA9"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Shield + inner glyph for block vs allow helper copy */
export function PeopleListShieldHintIcon13({
  variant,
}: {
  variant: "block" | "allow"
}): React.ReactElement {
  const inner = variant === "block" ? "M5 7h4" : "M5 7l1.5 1.5L9 5.5"
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="text-[#6E6E6E]"
      aria-hidden
    >
      <path
        d="M7 1.5l4.5 1.6V7c0 3-2.2 4.7-4.5 5.4C4.7 11.7 2.5 10 2.5 7V3.1L7 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d={inner}
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function VouchedShieldCheckHintIcon13(): React.ReactElement {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 14 14"
      fill="none"
      className="text-[#6E6E6E]"
      aria-hidden
    >
      <path
        d="M7 1.5l4.5 1.6V7c0 3-2.2 4.7-4.5 5.4C4.7 11.7 2.5 10 2.5 7V3.1L7 1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M5 7l1.5 1.5L9 5.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
