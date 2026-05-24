export const RULES_WORKSPACE_TAB_SEGMENTS = [
  "marketplace",
  "installed",
  "people",
  "requests",
  "files",
  "workflows",
] as const

export type RulesWorkspaceTab = (typeof RULES_WORKSPACE_TAB_SEGMENTS)[number]

const TAB_SET = new Set<string>(RULES_WORKSPACE_TAB_SEGMENTS)

/**
 * Active workspace tab from URL, or null on `/rules`, `/rules/custom`, etc.
 */
export function rulesWorkspaceTabFromPath(
  pathname: string,
  orgHandle: string
): RulesWorkspaceTab | null {
  const prefix = `/${orgHandle}/rules/`
  if (!pathname.startsWith(prefix)) return null
  const segment = pathname.slice(prefix.length).split("/")[0] ?? ""
  if (!segment || segment === "custom") return null
  if (!TAB_SET.has(segment)) return null
  return segment as RulesWorkspaceTab
}

export function rulesPathForTab(
  orgHandle: string,
  tab: RulesWorkspaceTab
): string {
  return `/${orgHandle}/rules/${tab}`
}

export function isRulesCustomPath(
  pathname: string,
  orgHandle: string
): boolean {
  return pathname.includes(`/${orgHandle}/rules/custom`)
}
