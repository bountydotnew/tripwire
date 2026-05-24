import { scoreTier } from "#/lib/score"

interface ScoreBadgeProps {
  score: number
  size?: "sm" | "md"
}

const tierStyles = {
  high: {
    dot: "bg-tw-success",
    text: "text-tw-success",
    chip: "bg-tw-success/10 border-tw-success/20",
  },
  mid: {
    dot: "bg-tw-warning",
    text: "text-tw-warning",
    chip: "bg-tw-warning/10 border-tw-warning/20",
  },
  low: {
    dot: "bg-tw-error",
    text: "text-tw-error",
    chip: "bg-tw-error/10 border-tw-error/20",
  },
} as const

export function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const tier = scoreTier(score)
  const styles = tierStyles[tier]
  const dotSize = size === "sm" ? "size-1.5" : "size-2"
  const textSize = size === "sm" ? "text-[11px]" : "text-[12px]"
  const padding = size === "sm" ? "px-1.5 py-0.5" : "px-2 py-0.5"

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border tabular-nums ${styles.chip} ${padding}`}
    >
      <span className={`shrink-0 rounded-full ${dotSize} ${styles.dot}`} />
      <span className={`font-medium ${textSize} ${styles.text}`}>{score}</span>
    </span>
  )
}
