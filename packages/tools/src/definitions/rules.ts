import { eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@tripwire/db/client"
import {
  DEFAULT_RULE_CONFIG,
  RULE_KEYS,
  type RuleConfig,
  type RuleKey,
  repositories,
  ruleConfigs,
} from "@tripwire/db"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import { ruleConfigSchema } from "@tripwire/core"
import { logEvent } from "@tripwire/core"
import { type AnyToolDefinition, defineTool, makeSpec } from "../registry"
import {
  RULE_NAMES,
  applyRuleMutation,
  describeScope,
  loadRuleConfig,
  requireRepoId,
} from "../helpers"

const ruleIdEnum = z.enum(RULE_KEYS)

const getRepoRules = defineTool({
  name: "get_repo_rules",
  description:
    "Get the full moderation rule configuration for the current repo — every rule with its enabled flag, action, type-specific fields, and any scopeOverride.",
  directInvokable: true,
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoBelongsToOrg(repoId, ctx.orgId)
    return loadRuleConfig(repoId)
  },
  chatRender: (config) => {
    const entries = Object.entries(config) as [string, unknown][]
    let enabledCount = 0
    const rules = entries
      .filter(([id]) => (RULE_KEYS as readonly string[]).includes(id))
      .map(([id, rule]) => {
        const r = rule as { enabled: boolean; action: string } & Record<
          string,
          unknown
        >
        if (r.enabled) enabledCount++
        return {
          id,
          name: RULE_NAMES[id as RuleKey] ?? id,
          enabled: r.enabled,
          action: r.action,
          detail: getRuleDetail(id as RuleKey, r),
        }
      })
    return makeSpec("RuleConfigCard", {
      rules,
      enabledCount,
      totalCount: rules.length,
    })
  },
})

function getRuleDetail(
  ruleId: RuleKey,
  rule: Record<string, unknown>
): string | undefined {
  if (ruleId === "languageRequirement" && rule.language)
    return `${rule.language}`
  if (ruleId === "minMergedPrs" && rule.count != null)
    return `${rule.count} PRs`
  if (ruleId === "accountAge" && rule.days != null) return `${rule.days} days`
  if (ruleId === "maxPrsPerDay" && rule.limit != null)
    return `${rule.limit}/day`
  if (ruleId === "maxFilesChanged" && rule.limit != null)
    return `${rule.limit} files`
  if (ruleId === "repoActivityMinimum" && rule.minRepos != null)
    return `${rule.minRepos} repos`
  return undefined
}

const toggleRule = defineTool({
  name: "toggle_rule",
  description: "Enable or disable a moderation rule.",
  inputSchema: z.object({
    ruleId: ruleIdEnum,
    enabled: z.boolean(),
  }),
  handler: async ({ ruleId, enabled }, ctx) => {
    const ruleName = RULE_NAMES[ruleId] ?? ruleId
    return applyRuleMutation({
      ctx,
      summary: `${ruleName} ${enabled ? "enabled" : "disabled"}`,
      metadata: { ruleId, enabled },
      mutate: (config) => {
        ;(config[ruleId] as { enabled: boolean }).enabled = enabled
      },
    })
  },
})

const updateRuleAction = defineTool({
  name: "update_rule_action",
  description:
    "Set a rule's action. 'block' closes content immediately; 'warn' leaves it open with a comment; 'log' records silently; 'threshold' counts violations per user and blocks at thresholdCount (provide thresholdCount when action='threshold').",
  inputSchema: z.object({
    ruleId: ruleIdEnum,
    action: z.enum(["block", "warn", "log", "threshold"]),
    thresholdCount: z.number().int().min(1).optional(),
  }),
  handler: async ({ ruleId, action, thresholdCount }, ctx) => {
    const ruleName = RULE_NAMES[ruleId] ?? ruleId
    return applyRuleMutation({
      ctx,
      summary: `${ruleName} action → ${action}${
        action === "threshold" && thresholdCount ? ` (×${thresholdCount})` : ""
      }`,
      metadata: { ruleId, action, thresholdCount },
      mutate: (config) => {
        const rule = config[ruleId] as {
          action: string
          thresholdCount?: number
        }
        rule.action = action
        if (action === "threshold" && thresholdCount !== undefined) {
          rule.thresholdCount = thresholdCount
        }
      },
    })
  },
})
const setMinMergedPrs = defineTool({
  name: "set_min_merged_prs",
  description:
    "Set the minimum-merged-PRs threshold. Authors with fewer merged PRs across GitHub trip the rule.",
  inputSchema: z.object({ count: z.number().int().min(0) }),
  handler: async ({ count }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Minimum Merged PRs → ${count}`,
      metadata: { ruleId: "minMergedPrs", count },
      mutate: (config) => {
        config.minMergedPrs.count = count
      },
    }),
})

const setAccountAge = defineTool({
  name: "set_account_age",
  description: "Set the minimum account age in days.",
  inputSchema: z.object({ days: z.number().int().min(0) }),
  handler: async ({ days }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Account Age → ${days} days`,
      metadata: { ruleId: "accountAge", days },
      mutate: (config) => {
        config.accountAge.days = days
      },
    }),
})

const setMaxPrsPerDay = defineTool({
  name: "set_max_prs_per_day",
  description: "Set the per-author daily PR cap.",
  inputSchema: z.object({ limit: z.number().int().min(1) }),
  handler: async ({ limit }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Max PRs Per Day → ${limit}`,
      metadata: { ruleId: "maxPrsPerDay", limit },
      mutate: (config) => {
        config.maxPrsPerDay.limit = limit
      },
    }),
})

const setMaxFilesChanged = defineTool({
  name: "set_max_files_changed",
  description: "Set the per-PR files-changed cap.",
  inputSchema: z.object({ limit: z.number().int().min(1) }),
  handler: async ({ limit }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Max Files Changed → ${limit}`,
      metadata: { ruleId: "maxFilesChanged", limit },
      mutate: (config) => {
        config.maxFilesChanged.limit = limit
      },
    }),
})

const setRepoActivityMinimum = defineTool({
  name: "set_repo_activity_minimum",
  description:
    "Set the minimum number of public non-fork repos an author must own to pass.",
  inputSchema: z.object({ minRepos: z.number().int().min(1) }),
  handler: async ({ minRepos }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Repo Activity Minimum → ${minRepos}`,
      metadata: { ruleId: "repoActivityMinimum", minRepos },
      mutate: (config) => {
        config.repoActivityMinimum.minRepos = minRepos
      },
    }),
})

const setLanguageRequirement = defineTool({
  name: "set_language_requirement",
  description:
    "Set the required content language (e.g. 'English', 'Spanish'). Used when languageRequirement is enabled.",
  inputSchema: z.object({ language: z.string().min(1) }),
  handler: async ({ language }, ctx) =>
    applyRuleMutation({
      ctx,
      summary: `Language Requirement → ${language}`,
      metadata: { ruleId: "languageRequirement", language },
      mutate: (config) => {
        config.languageRequirement.language = language
      },
    }),
})

const setContentScope = defineTool({
  name: "set_content_scope",
  description:
    "Set the repo-wide content scope — which content types the pipeline watches by default. Pass only the keys you want to change; omitted keys stay as-is.",
  inputSchema: z.object({
    pullRequests: z.boolean().optional(),
    issues: z.boolean().optional(),
    comments: z.boolean().optional(),
  }),
  handler: async ({ pullRequests, issues, comments }, ctx) => {
    if (
      pullRequests === undefined &&
      issues === undefined &&
      comments === undefined
    ) {
      return {
        ok: false,
        message: "Provide at least one of pullRequests, issues, comments.",
      }
    }
    let nextScope: RuleConfig["contentScope"] | null = null
    const result = await applyRuleMutation({
      ctx,
      summary: "Content scope updated",
      metadata: { tool: "set_content_scope" },
      mutate: (config) => {
        if (pullRequests !== undefined)
          config.contentScope.pullRequests = pullRequests
        if (issues !== undefined) config.contentScope.issues = issues
        if (comments !== undefined) config.contentScope.comments = comments
        nextScope = config.contentScope
      },
    })
    if (result.ok && nextScope) {
      return {
        ...result,
        message: `Content scope: ${describeScope(nextScope)}.`,
        data: { contentScope: nextScope },
      }
    }
    return result
  },
})

const setRuleScope = defineTool({
  name: "set_rule_scope",
  description:
    "Override which content types a single rule applies to, instead of inheriting the repo's contentScope. Pass only the keys you want to override; omitted keys inherit. Example: setting issues=true on cryptoAddressDetection makes the crypto rule watch issues even if the rest of the pipeline doesn't.",
  inputSchema: z.object({
    ruleId: ruleIdEnum,
    pullRequests: z.boolean().optional(),
    issues: z.boolean().optional(),
    comments: z.boolean().optional(),
  }),
  handler: async ({ ruleId, pullRequests, issues, comments }, ctx) => {
    if (
      pullRequests === undefined &&
      issues === undefined &&
      comments === undefined
    ) {
      return {
        ok: false,
        message:
          "Provide at least one of pullRequests, issues, comments. To remove an override entirely, use clear_rule_scope.",
      }
    }
    const ruleName = RULE_NAMES[ruleId] ?? ruleId
    let nextOverride: Record<string, boolean> = {}
    const result = await applyRuleMutation({
      ctx,
      summary: `${ruleName} scope override updated`,
      metadata: { ruleId },
      mutate: (config) => {
        const rule = config[ruleId]
        const next = { ...(rule.scopeOverride ?? {}) }
        if (pullRequests !== undefined) next.pullRequests = pullRequests
        if (issues !== undefined) next.issues = issues
        if (comments !== undefined) next.comments = comments
        rule.scopeOverride = next
        nextOverride = next
      },
    })
    if (result.ok) {
      return {
        ...result,
        message: `${ruleName} scope override → ${describeScope(nextOverride)}.`,
        data: { ruleId, scopeOverride: nextOverride },
      }
    }
    return result
  },
})

const clearRuleScope = defineTool({
  name: "clear_rule_scope",
  description:
    "Remove a rule's scopeOverride entirely. The rule then inherits the repo-wide contentScope for all content types.",
  inputSchema: z.object({ ruleId: ruleIdEnum }),
  handler: async ({ ruleId }, ctx) => {
    const ruleName = RULE_NAMES[ruleId] ?? ruleId
    return applyRuleMutation({
      ctx,
      summary: `${ruleName} scope override cleared`,
      metadata: { ruleId },
      mutate: (config) => {
        config[ruleId].scopeOverride = undefined
      },
    })
  },
})
const copyRules = defineTool({
  name: "copy_rules",
  description:
    "Copy rule configuration between two repos you own. Pass a ruleId to copy a single rule (preserves the destination's other rules). Omit ruleId to replace the destination's entire rule config with the source's.",
  surfaces: ["mcp"],
  needsRepo: false,
  inputSchema: z.object({
    fromRepoId: z.string().uuid(),
    toRepoId: z.string().uuid(),
    ruleId: ruleIdEnum.optional(),
  }),
  handler: async ({ fromRepoId, toRepoId, ruleId }, ctx) => {
    if (fromRepoId === toRepoId) {
      return {
        ok: false,
        message: "fromRepoId and toRepoId must be different repos.",
      }
    }
    await Promise.all([
      assertRepoBelongsToOrg(fromRepoId, ctx.orgId),
      assertRepoBelongsToOrg(toRepoId, ctx.orgId),
    ])
    const [fromRepo] = await db
      .select({ fullName: repositories.fullName })
      .from(repositories)
      .where(eq(repositories.id, fromRepoId))
    const [toRepo] = await db
      .select({ fullName: repositories.fullName })
      .from(repositories)
      .where(eq(repositories.id, toRepoId))

    const sourceConfig = await loadRuleConfig(fromRepoId)
    const targetConfig = await loadRuleConfig(toRepoId)
    const nextConfig: RuleConfig = ruleId
      ? {
          ...targetConfig,
          [ruleId]: structuredClone(sourceConfig[ruleId]),
        }
      : structuredClone(sourceConfig)

    const parsed = ruleConfigSchema.safeParse(nextConfig)
    if (!parsed.success) {
      return {
        ok: false,
        message: `Invalid rule config after copy: ${parsed.error.message}`,
      }
    }

    const [existing] = await db
      .select({ id: ruleConfigs.id })
      .from(ruleConfigs)
      .where(eq(ruleConfigs.repoId, toRepoId))
    if (existing) {
      await db
        .update(ruleConfigs)
        .set({ config: parsed.data, updatedAt: new Date() })
        .where(eq(ruleConfigs.repoId, toRepoId))
    } else {
      await db
        .insert(ruleConfigs)
        .values({ repoId: toRepoId, config: parsed.data })
    }

    const summary = ruleId
      ? `Copied rule "${ruleId}" from ${fromRepo?.fullName ?? fromRepoId} → ${toRepo?.fullName ?? toRepoId}`
      : `Copied full rule config from ${fromRepo?.fullName ?? fromRepoId} → ${toRepo?.fullName ?? toRepoId}`

    await logEvent({
      repoId: toRepoId,
      action: "rule_config_updated",
      severity: "info",
      description: summary,
      metadata: {
        sourceRepoId: fromRepoId,
        sourceRepoFullName: fromRepo?.fullName ?? null,
        ruleId: ruleId ?? null,
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return {
      ok: true,
      message: summary,
      data: {
        from: { id: fromRepoId, fullName: fromRepo?.fullName ?? null },
        to: { id: toRepoId, fullName: toRepo?.fullName ?? null },
        ruleId: ruleId ?? null,
      },
    }
  },
})

void DEFAULT_RULE_CONFIG

export const ruleTools: AnyToolDefinition[] = [
  getRepoRules,
  toggleRule,
  updateRuleAction,
  setMinMergedPrs,
  setAccountAge,
  setMaxPrsPerDay,
  setMaxFilesChanged,
  setRepoActivityMinimum,
  setLanguageRequirement,
  setContentScope,
  setRuleScope,
  clearRuleScope,
  copyRules,
]
