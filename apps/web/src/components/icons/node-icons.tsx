import type { SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement>

export function TriggerIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
    </svg>
  )
}

export function ScheduleIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.25C6.06294 1.25 1.25 6.06294 1.25 12C1.25 17.9371 6.06294 22.75 12 22.75C17.9371 22.75 22.75 17.9371 22.75 12C22.75 6.06294 17.9371 1.25 12 1.25ZM13 11.5858V7H11V12.4142L13.7929 15.2071L15.2071 13.7929L13 11.5858Z"
      />
    </svg>
  )
}

export function RuleIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8 1a1 1 0 0 1 .7.3l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5A1 1 0 0 1 8 1Z" />
    </svg>
  )
}

export function ConditionIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v2.382a1.5 1.5 0 0 1-.44 1.06L9.5 9.005v4.245a.75.75 0 0 1-1.2.6l-2-1.5a.75.75 0 0 1-.3-.6V9.005l-3.06-3.063A1.5 1.5 0 0 1 3 4.882V2.5Z" />
    </svg>
  )
}

export function LogicGateIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 28 29" fill="none" {...props}>
      <path
        d="M23.1 1.02C22.18 1.01 21.29 1.34 20.59 1.93C19.89 2.52 19.41 3.34 19.26 4.25C19.1 5.15 19.27 6.09 19.74 6.88C20.2 7.67 20.93 8.27 21.8 8.58V12.72H6.2V8.58C7.07 8.27 7.8 7.67 8.26 6.87C8.73 6.08 8.9 5.15 8.74 4.24C8.59 3.33 8.12 2.51 7.41 1.92C6.71 1.33 5.82 1 4.9 1C3.98 1 3.09 1.33 2.39 1.92C1.68 2.51 1.21 3.33 1.06 4.24C0.9 5.15 1.07 6.08 1.54 6.87C2 7.67 2.73 8.27 3.6 8.58V12.72C3.6 13.41 3.87 14.07 4.36 14.56C4.85 15.04 5.51 15.32 6.2 15.32H12.7V20.76C11.83 21.06 11.1 21.67 10.64 22.46C10.17 23.25 10 24.19 10.16 25.09C10.31 26 10.78 26.82 11.49 27.42C12.19 28.01 13.08 28.33 14 28.33C14.92 28.33 15.81 28.01 16.51 27.42C17.22 26.82 17.69 26 17.85 25.09C18 24.19 17.83 23.25 17.36 22.46C16.9 21.67 16.17 21.06 15.3 20.76V15.32H21.8C22.49 15.32 23.15 15.04 23.64 14.56C24.13 14.07 24.4 13.41 24.4 12.72V8.58C25.27 8.27 26 7.67 26.46 6.88C26.93 6.09 27.1 5.15 26.94 4.25C26.79 3.34 26.32 2.52 25.61 1.93C24.91 1.34 24.02 1.01 23.1 1.02ZM4.9 6.22C4.64 6.22 4.39 6.14 4.18 6C3.96 5.85 3.8 5.65 3.7 5.41C3.6 5.18 3.58 4.91 3.63 4.66C3.68 4.41 3.8 4.18 3.98 4C4.16 3.82 4.39 3.69 4.65 3.64C4.9 3.59 5.16 3.62 5.4 3.72C5.64 3.81 5.84 3.98 5.98 4.19C6.12 4.41 6.2 4.66 6.2 4.92C6.2 5.26 6.06 5.59 5.82 5.84C5.58 6.08 5.25 6.22 4.9 6.22ZM14 25.72C13.74 25.72 13.49 25.64 13.28 25.5C13.06 25.36 12.9 25.15 12.8 24.92C12.7 24.68 12.68 24.42 12.73 24.16C12.78 23.91 12.9 23.68 13.08 23.5C13.26 23.32 13.5 23.19 13.75 23.14C14 23.09 14.26 23.12 14.5 23.22C14.74 23.32 14.94 23.48 15.08 23.7C15.22 23.91 15.3 24.16 15.3 24.42C15.3 24.76 15.16 25.09 14.92 25.34C14.68 25.58 14.35 25.72 14 25.72ZM23.1 6.22C22.84 6.22 22.59 6.14 22.38 6C22.17 5.85 22 5.65 21.9 5.41C21.8 5.18 21.78 4.91 21.83 4.66C21.88 4.41 22 4.18 22.18 4C22.36 3.82 22.6 3.69 22.85 3.64C23.1 3.59 23.36 3.62 23.6 3.72C23.84 3.81 24.04 3.98 24.18 4.19C24.33 4.41 24.4 4.66 24.4 4.92C24.4 5.26 24.26 5.59 24.02 5.84C23.78 6.08 23.45 6.22 23.1 6.22Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.25"
      />
    </svg>
  )
}

export function ActionIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm2.78-9.78a.75.75 0 0 0-1.06 0L7 7.94 6.28 7.22a.75.75 0 0 0-1.06 1.06l1.25 1.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 0 0 0-1.06Z" />
    </svg>
  )
}

export function DelayIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm-.75-10.5v4c0 .2.08.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 8.19V4.5a.75.75 0 0 0-1.5 0Z" />
    </svg>
  )
}

export function TransformIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path
        d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

export function LanguageIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12 1.25C6.063 1.25 1.25 6.063 1.25 12S6.063 22.75 12 22.75 22.75 17.937 22.75 12 17.937 1.25 12 1.25ZM9.53 3.57A8.76 8.76 0 0 0 3.28 11.25h4.48c.1-2.89.78-5.51 1.77-7.68ZM11.25 3.4c-1.13 1.98-1.92 4.6-2.04 7.85h5.58c-.12-3.25-.91-5.87-2.04-7.85a8.8 8.8 0 0 0-.75-.05 8.8 8.8 0 0 0-.75.05ZM16.24 11.25c-.1-2.89-.78-5.51-1.77-7.68a8.76 8.76 0 0 1 6.25 7.68h-4.48ZM14.79 12.75H9.21c.12 3.25.91 5.87 2.04 7.85.25.02.5.05.75.05s.5-.03.75-.05c1.13-1.98 1.92-4.6 2.04-7.85ZM14.47 20.43c.99-2.17 1.67-4.79 1.77-7.68h4.48a8.76 8.76 0 0 1-6.25 7.68ZM7.76 12.75c.1 2.89.78 5.51 1.77 7.68a8.76 8.76 0 0 1-6.25-7.68h4.48Z"
      />
    </svg>
  )
}

export function WebhookIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2Z"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M12 8v4l3 3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="2" fill="currentColor" />
      <path
        d="M12 6v1M18 12h-1M12 18v-1M6 12h1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function GitHubTriggerIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="currentColor"
      {...props}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

export function ScanIcon(props: IconProps) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" {...props}>
      <path
        d="M21 21l-4.35-4.35M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11 8v6M8 11h6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function ManualIcon(props: IconProps) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M12 2a3 3 0 0 0-3 3v4.268a2 2 0 0 0-1.789.632l-3.942 4.27A2 2 0 0 0 4.74 18h6.404a3 3 0 0 0 2.122-.879l4.83-4.829A2 2 0 0 0 15 8.879V5a3 3 0 0 0-3-3Zm-1 3a1 1 0 1 1 2 0v5a1 1 0 1 1-2 0V5Z" />
    </svg>
  )
}
