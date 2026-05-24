interface TripwireLogoProps {
  className?: string
  size?: number
  fill?: string
}

export function TripwireLogo({
  className,
  size = 18,
  fill = "currentColor",
}: TripwireLogoProps) {
  return (
    <svg
      viewBox="0 0 610.08 589.32"
      width={size}
      height={size}
      fill={fill}
      preserveAspectRatio="none"
      className={className}
    >
      <path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
      <circle cx="305.04" cy="90.37" r="90.37" />
    </svg>
  )
}
