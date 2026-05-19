import type { CustomRuleAction } from "@tripwire/db"

export function formatTimeAgo(date: string | Date): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

const ACTION_BADGE_MAP: Record<
  CustomRuleAction,
  { label: string; className: string }
> = {
  block: { label: "Block", className: "bg-red-500/15 text-red-300" },
  warn: { label: "Warn", className: "bg-amber-500/15 text-amber-300" },
  log: { label: "Log", className: "bg-white/10 text-[#FFFFFF73]" },
  threshold: {
    label: "Threshold",
    className: "bg-tw-accent/15 text-tw-accent",
  },
}

export function getActionBadgeProps(action: CustomRuleAction): {
  label: string
  className: string
} {
  return ACTION_BADGE_MAP[action] ?? ACTION_BADGE_MAP.log
}

export function isCustomRuleName(ruleName: string): boolean {
  return ruleName.startsWith("custom:")
}

export function stripCustomRulePrefix(ruleName: string): string {
  return ruleName.replace(/^custom:/, "")
}
