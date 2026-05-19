import type { CustomRuleDefinition } from "@tripwire/db"
import { SIGNAL_REGISTRY } from "./signal-registry"

export interface CustomRuleLimits {
  maxRules: number
  canUseEnrichmentSignals: boolean
}

export function getCustomRuleLimits(
  planId: string | null | undefined
): CustomRuleLimits {
  if (planId === "pro" || planId === "team" || planId === "enterprise") {
    return { maxRules: 10, canUseEnrichmentSignals: true }
  }

  return { maxRules: 2, canUseEnrichmentSignals: false }
}

export function countDefinitionNodes(definition: unknown): number {
  if (
    definition &&
    typeof definition === "object" &&
    "nodes" in definition &&
    Array.isArray((definition as Record<string, unknown>).nodes)
  ) {
    return ((definition as Record<string, unknown>).nodes as unknown[]).length
  }
  return 0
}

export function definitionReferencesEnrichment(
  definition: CustomRuleDefinition
): boolean {
  const enrichmentSignalIds = new Set(
    SIGNAL_REGISTRY.filter((s) => s.requiresEnrichment).map((s) => s.id)
  )
  return definition.nodes.some((node) => {
    if (node.type !== "condition") return false
    const signalId = node.data.signal as string | undefined
    return signalId ? enrichmentSignalIds.has(signalId) : false
  })
}
