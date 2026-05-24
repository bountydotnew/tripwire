import type * as React from "react"

export function HeroStatSparklineGraphic({
  className,
}: {
  className?: string
}): React.ReactElement {
  return (
    <svg
      width="256"
      height="78"
      viewBox="0 0 256 78"
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor="#0F8A1B" stopOpacity="0.25" />
          <stop offset="95%" stopColor="#0F8A1B" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path
        fill="url(#sparkGrad)"
        d="M5,73C15.25,73,25.5,73,35.75,73C46,73,56.25,16.333,66.5,16.333C76.75,16.333,87,20.111,97.25,27.667C107.5,35.222,117.75,73,128,73C138.25,73,148.5,73,158.75,73C169,73,179.25,73,189.5,73C199.75,73,210,73,220.25,73C230.5,73,240.75,65.067,251,57.133L251,73C240.75,73,230.5,73,220.25,73C210,73,199.75,73,189.5,73C179.25,73,169,73,158.75,73C148.5,73,138.25,73,128,73C117.75,73,107.5,73,97.25,73C87,73,76.75,73,66.5,73C56.25,73,46,73,35.75,73C25.5,73,15.25,73,5,73Z"
      />
      <path
        fill="none"
        stroke="#0F8A1B"
        strokeWidth="2"
        d="M5,73C15.25,73,25.5,73,35.75,73C46,73,56.25,16.333,66.5,16.333C76.75,16.333,87,20.111,97.25,27.667C107.5,35.222,117.75,73,128,73C138.25,73,148.5,73,158.75,73C169,73,179.25,73,189.5,73C199.75,73,210,73,220.25,73C230.5,73,240.75,65.067,251,57.133"
      />
    </svg>
  )
}
