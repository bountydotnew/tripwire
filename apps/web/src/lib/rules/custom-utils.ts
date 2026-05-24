import type { CustomRuleAction } from "@tripwire/db"

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
