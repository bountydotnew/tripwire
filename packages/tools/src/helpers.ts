import { eq } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import {
  DEFAULT_RULE_CONFIG,
  type RuleConfig,
  type RuleKey,
  ruleConfigs,
} from "@tripwire/db"
import { ruleConfigSchema } from "@tripwire/core"
import { normalizeRuleConfig } from "@tripwire/core"
import { logEvent } from "@tripwire/core"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import type { MutationResult, ToolContext } from "./registry"
import { RULE_META } from "@tripwire/db"
export const RULE_NAMES: Record<RuleKey, string> = Object.fromEntries(
  Object.entries(RULE_META).map(([k, v]) => [k, v.name])
) as Record<RuleKey, string>
export function requireRepoId(ctx: ToolContext): string {
  if (!ctx.repoId) {
    throw new Error("repoId is required for this tool but missing from context")
  }
  return ctx.repoId
}
export async function loadRuleConfig(repoId: string): Promise<RuleConfig> {
  const [row] = await db
    .select()
    .from(ruleConfigs)
    .where(eq(ruleConfigs.repoId, repoId))
  return normalizeRuleConfig(row?.config ?? DEFAULT_RULE_CONFIG)
}

async function persistRuleConfig(
  repoId: string,
  config: RuleConfig
): Promise<void> {
  const normalized = normalizeRuleConfig(config)
  const [existing] = await db
    .select({ id: ruleConfigs.id })
    .from(ruleConfigs)
    .where(eq(ruleConfigs.repoId, repoId))
  if (existing) {
    await db
      .update(ruleConfigs)
      .set({ config: normalized, updatedAt: new Date() })
      .where(eq(ruleConfigs.repoId, repoId))
  } else {
    await db.insert(ruleConfigs).values({ repoId, config: normalized })
  }
}
export interface RuleMutationOpts {
  ctx: ToolContext
  /** Human-readable summary for the event description. */
  summary: string
  /** Structured event metadata. `updatedBy` / `viaMcp` get merged automatically. */
  metadata?: Record<string, unknown>
  /** Mutator: receives a draft config; mutate in place. */
  mutate: (config: RuleConfig) => void
}

/**
 * The canonical "edit rule config" flow: assert repo ownership, load
 * current config, run a mutator on a draft, validate, persist, log.
 * Returns a MutationResult that both adapters can present.
 */
export async function applyRuleMutation(
  opts: RuleMutationOpts
): Promise<MutationResult> {
  const repoId = requireRepoId(opts.ctx)
  await assertRepoBelongsToOrg(repoId, opts.ctx.orgId)

  const current = await loadRuleConfig(repoId)
  const draft = structuredClone(current) as RuleConfig
  opts.mutate(draft)

  const parsed = ruleConfigSchema.safeParse(draft)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const path = issue?.path.join(".") ?? "config"
    return {
      ok: false,
      message: `Invalid rule config: ${path} — ${issue?.message ?? "validation failed"}.`,
    }
  }

  await persistRuleConfig(repoId, parsed.data)

  await logEvent({
    repoId,
    action: "rule_config_updated",
    severity: "info",
    description: opts.summary,
    metadata: {
      updatedBy: opts.ctx.userName ?? null,
      viaTool: true,
      ...opts.metadata,
    },
  })

  return { ok: true, message: opts.summary }
}
export function describeScope(scope: {
  pullRequests?: boolean
  issues?: boolean
  comments?: boolean
}): string {
  const labels = {
    pullRequests: "PRs",
    issues: "issues",
    comments: "comments",
  } as const
  const on: string[] = []
  const off: string[] = []
  for (const k of ["pullRequests", "issues", "comments"] as const) {
    if (scope[k] === true) on.push(labels[k])
    else if (scope[k] === false) off.push(labels[k])
  }
  const parts: string[] = []
  if (on.length) parts.push(`on: ${on.join(", ")}`)
  if (off.length) parts.push(`off: ${off.join(", ")}`)
  return parts.join("; ") || "inherits"
}
