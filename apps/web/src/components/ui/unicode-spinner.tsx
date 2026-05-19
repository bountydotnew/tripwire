import { cn } from "@tripwire/ui/utils"
import { memo, useEffect, useState } from "react"

export type SpinnerVariant =
  | "dots"
  | "dots2"
  | "orbit"
  | "breathe"
  | "snake"
  | "columns"
  | "helix"
  | "diagswipe"
  | "fillsweep"
  | "line"

interface SpinnerDef {
  readonly frames: readonly string[]
  readonly interval: number
}

const SPINNERS: Record<SpinnerVariant, SpinnerDef> = {
  dots: {
    frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
    interval: 80,
  },
  dots2: {
    frames: ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"],
    interval: 80,
  },
  orbit: {
    frames: ["⠃", "⠉", "⠘", "⠰", "⢠", "⣀", "⡄", "⠆"],
    interval: 100,
  },
  breathe: {
    frames: [
      "⠀",
      "⠂",
      "⠌",
      "⡑",
      "⢕",
      "⢝",
      "⣫",
      "⣟",
      "⣿",
      "⣟",
      "⣫",
      "⢝",
      "⢕",
      "⡑",
      "⠌",
      "⠂",
      "⠀",
    ],
    interval: 100,
  },
  snake: {
    frames: [
      "⣁⡀",
      "⣉⠀",
      "⡉⠁",
      "⠉⠉",
      "⠈⠙",
      "⠀⠛",
      "⠐⠚",
      "⠒⠒",
      "⠖⠂",
      "⠶⠀",
      "⠦⠄",
      "⠤⠤",
      "⠠⢤",
      "⠀⣤",
      "⢀⣠",
      "⣀⣀",
    ],
    interval: 80,
  },
  columns: {
    frames: [
      "⡀⠀⠀",
      "⡄⠀⠀",
      "⡆⠀⠀",
      "⡇⠀⠀",
      "⣇⠀⠀",
      "⣧⠀⠀",
      "⣷⠀⠀",
      "⣿⠀⠀",
      "⣿⡀⠀",
      "⣿⡄⠀",
      "⣿⡆⠀",
      "⣿⡇⠀",
      "⣿⣇⠀",
      "⣿⣧⠀",
      "⣿⣷⠀",
      "⣿⣿⠀",
      "⣿⣿⡀",
      "⣿⣿⡄",
      "⣿⣿⡆",
      "⣿⣿⡇",
      "⣿⣿⣇",
      "⣿⣿⣧",
      "⣿⣿⣷",
      "⣿⣿⣿",
      "⣿⣿⣿",
      "⠀⠀⠀",
    ],
    interval: 60,
  },
  helix: {
    frames: ["⢌⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉", "⢎⣉⢎⣉", "⣉⡱⣉⡱", "⣉⢎⣉⢎", "⡱⣉⡱⣉"],
    interval: 80,
  },
  diagswipe: {
    frames: [
      "⠁⠀",
      "⠋⠀",
      "⠟⠁",
      "⡿⠋",
      "⣿⠟",
      "⣿⡿",
      "⣿⣿",
      "⣿⣿",
      "⣾⣿",
      "⣴⣿",
      "⣠⣾",
      "⢀⣴",
      "⠀⣠",
      "⠀⢀",
      "⠀⠀",
      "⠀⠀",
    ],
    interval: 60,
  },
  fillsweep: {
    frames: ["⣀⣀", "⣤⣤", "⣶⣶", "⣿⣿", "⣿⣿", "⣿⣿", "⣶⣶", "⣤⣤", "⣀⣀", "⠀⠀", "⠀⠀"],
    interval: 100,
  },
  line: {
    frames: ["|", "/", "—", "\\"],
    interval: 100,
  },
}

const SPINNER_FONT_STACK =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'

function prefersReducedMotion() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

export interface UnicodeSpinnerProps {
  className?: string
  label?: string
  variant?: SpinnerVariant
}

export const UnicodeSpinner = memo(
  ({ variant = "dots", className, label = "Loading" }: UnicodeSpinnerProps) => {
    const def = SPINNERS[variant]
    const [frame, setFrame] = useState(0)

    useEffect(() => {
      if (prefersReducedMotion()) return
      const frameCount = def.frames.length
      const id = setInterval(() => {
        setFrame((f) => (f + 1) % frameCount)
      }, def.interval)
      return () => clearInterval(id)
    }, [def.frames.length, def.interval])

    const char = def.frames[frame] ?? def.frames[0]

    return (
      <span
        aria-label={label}
        className={cn(
          "inline-flex shrink-0 justify-center leading-none whitespace-pre tabular-nums",
          className
        )}
        role="status"
        style={{ fontFamily: SPINNER_FONT_STACK }}
      >
        {char}
      </span>
    )
  }
)

UnicodeSpinner.displayName = "UnicodeSpinner"

const THINKING_VARIANTS: readonly SpinnerVariant[] = [
  "dots",
  "dots2",
  "orbit",
  "breathe",
  "snake",
  "columns",
  "helix",
  "diagswipe",
  "fillsweep",
  "line",
] as const

function pickRandomThinkingVariant(): SpinnerVariant {
  const idx = Math.floor(Math.random() * THINKING_VARIANTS.length)
  return THINKING_VARIANTS[idx] ?? "dots"
}

export function useRandomThinkingVariant(): SpinnerVariant {
  const [variant] = useState(pickRandomThinkingVariant)
  return variant
}
