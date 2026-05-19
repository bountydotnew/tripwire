import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@tripwire/db/client"
import { customRules } from "@tripwire/db"
import { assertRepoOwner } from "@tripwire/core"
import { logEvent } from "@tripwire/core"
import { createCustomRuleSchema } from "@tripwire/core"
import { getCustomRuleLimits, countDefinitionNodes } from "@tripwire/core"
import { applyWorkflowOperations } from "@tripwire/core"
import { workflowOperationsArraySchema } from "@tripwire/core"
import { type AnyToolDefinition, defineTool, makeSpec } from "../registry"
import { requireRepoId } from "../helpers"

const listCustomRules = defineTool({
  name: "list_custom_rules",
  description:
    "List all custom rules for the current repo. Shows name, enabled state, action, description, and node count.",
  inputSchema: z.object({}),
  handler: async (_args, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const rows = await db
      .select()
      .from(customRules)
      .where(eq(customRules.repoId, repoId))

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      action: r.action,
      description: r.description,
      nodeCount: countDefinitionNodes(r.definition),
    }))
  },
  chatRender: (output) => {
    return makeSpec("CustomRuleListCard", {
      rules: output,
      totalCount: output.length,
      enabledCount: output.filter((r) => r.enabled).length,
    })
  },
})

const getCustomRule = defineTool({
  name: "get_custom_rule",
  description:
    "Get full detail of a custom rule by ID, including its definition graph, action, scope override, and simulation status.",
  inputSchema: z.object({
    ruleId: z.string().uuid(),
  }),
  handler: async ({ ruleId }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const [rule] = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, ruleId), eq(customRules.repoId, repoId)))

    if (!rule) {
      return { ok: false, message: `Custom rule ${ruleId} not found.` }
    }

    return {
      ok: true,
      rule: {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        enabled: rule.enabled,
        action: rule.action,
        thresholdCount: rule.thresholdCount,
        scopeOverride: rule.scopeOverride,
        definition: rule.definition,
        simulatedAt: rule.simulatedAt?.toISOString() ?? null,
        priority: rule.priority,
        nodeCount: countDefinitionNodes(rule.definition),
        createdAt: rule.createdAt.toISOString(),
        updatedAt: rule.updatedAt.toISOString(),
      },
    }
  },
  chatRender: (output) => {
    if (!output.ok) {
      return makeSpec("ActionResult", { ok: false, message: output.message })
    }
    return makeSpec("CustomRuleDetailCard", { rule: output.rule })
  },
})

const createCustomRule = defineTool({
  name: "create_custom_rule",
  description:
    "Create a new custom rule with a condition graph definition. The rule starts disabled; simulate it first, then toggle it on.",
  inputSchema: z.object({
    name: z.string().min(1).max(100),
    description: z.string().max(500).optional().nullable(),
    definition: z.object({
      nodes: z
        .array(
          z.object({
            id: z.string().min(1),
            type: z.enum(["condition", "logic", "transform"]),
            position: z.object({ x: z.number(), y: z.number() }),
            data: z.record(z.string(), z.unknown()),
          })
        )
        .min(1),
      edges: z.array(
        z.object({
          id: z.string().min(1),
          source: z.string().min(1),
          target: z.string().min(1),
          sourceHandle: z.string().nullable().optional(),
          targetHandle: z.string().nullable().optional(),
          label: z.string().optional(),
          animated: z.boolean().optional(),
        })
      ),
      outputNodeId: z.string().min(1),
    }),
    action: z.enum(["block", "warn", "log", "threshold"]),
    thresholdCount: z.number().int().min(1).optional(),
    scopeOverride: z
      .object({
        pullRequests: z.boolean().optional(),
        issues: z.boolean().optional(),
        comments: z.boolean().optional(),
      })
      .optional()
      .nullable(),
  }),
  handler: async (args, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const input = { ...args, repoId, priority: 0 }
    const parsed = createCustomRuleSchema.safeParse(input)
    if (!parsed.success) {
      const issue = parsed.error.issues[0]
      const path = issue?.path.join(".") ?? "input"
      return {
        ok: false,
        message: `Validation failed: ${path} — ${issue?.message ?? "invalid"}`,
      }
    }

    const limits = getCustomRuleLimits(null)
    const existingCount = await db
      .select({ id: customRules.id })
      .from(customRules)
      .where(eq(customRules.repoId, repoId))

    if (existingCount.length >= limits.maxRules) {
      return {
        ok: false,
        message: `Tier limit reached: max ${limits.maxRules} custom rules. Upgrade to add more.`,
      }
    }

    const [inserted] = await db
      .insert(customRules)
      .values({
        repoId: parsed.data.repoId,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        definition: parsed.data.definition,
        action: parsed.data.action,
        thresholdCount: parsed.data.thresholdCount ?? null,
        scopeOverride: parsed.data.scopeOverride ?? null,
        priority: parsed.data.priority,
        enabled: false,
      })
      .returning({ id: customRules.id })

    await logEvent({
      repoId,
      action: "rule_config_updated",
      severity: "info",
      description: `Custom rule "${parsed.data.name}" created`,
      metadata: {
        customRuleId: inserted.id,
        name: parsed.data.name,
        ruleAction: parsed.data.action,
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return {
      ok: true,
      message: `Custom rule "${parsed.data.name}" created (disabled). Simulate before enabling.`,
      data: { id: inserted.id, name: parsed.data.name },
    }
  },
})

const toggleCustomRule = defineTool({
  name: "toggle_custom_rule",
  description:
    "Enable or disable a custom rule. A rule must have been simulated (simulatedAt non-null) before it can be enabled.",
  inputSchema: z.object({
    ruleId: z.string().uuid(),
    enabled: z.boolean(),
  }),
  handler: async ({ ruleId, enabled }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const [rule] = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, ruleId), eq(customRules.repoId, repoId)))

    if (!rule) {
      return { ok: false, message: `Custom rule ${ruleId} not found.` }
    }

    if (enabled && !rule.simulatedAt) {
      return {
        ok: false,
        message:
          "Cannot enable a custom rule that has not been simulated. Run a simulation first.",
      }
    }

    await db
      .update(customRules)
      .set({ enabled, updatedAt: new Date() })
      .where(eq(customRules.id, ruleId))

    const summary = `Custom rule "${rule.name}" ${enabled ? "enabled" : "disabled"}`

    await logEvent({
      repoId,
      action: "rule_config_updated",
      severity: "info",
      description: summary,
      metadata: {
        customRuleId: ruleId,
        name: rule.name,
        enabled,
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return { ok: true, message: summary }
  },
})

const updateCustomRuleAction = defineTool({
  name: "update_custom_rule_action",
  description:
    "Change a custom rule's action. 'block' closes content immediately; 'warn' leaves it open with a comment; 'log' records silently; 'threshold' counts violations and blocks at thresholdCount.",
  inputSchema: z.object({
    ruleId: z.string().uuid(),
    action: z.enum(["block", "warn", "log", "threshold"]),
    thresholdCount: z.number().int().min(1).optional(),
  }),
  handler: async ({ ruleId, action, thresholdCount }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const [rule] = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, ruleId), eq(customRules.repoId, repoId)))

    if (!rule) {
      return { ok: false, message: `Custom rule ${ruleId} not found.` }
    }

    const updates: Record<string, unknown> = {
      action,
      updatedAt: new Date(),
    }
    if (action === "threshold" && thresholdCount !== undefined) {
      updates.thresholdCount = thresholdCount
    }

    await db.update(customRules).set(updates).where(eq(customRules.id, ruleId))

    const summary = `Custom rule "${rule.name}" action → ${action}${
      action === "threshold" && thresholdCount ? ` (×${thresholdCount})` : ""
    }`

    await logEvent({
      repoId,
      action: "rule_config_updated",
      severity: "info",
      description: summary,
      metadata: {
        customRuleId: ruleId,
        name: rule.name,
        ruleAction: action,
        thresholdCount: thresholdCount ?? null,
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return { ok: true, message: summary }
  },
})

const deleteCustomRule = defineTool({
  name: "delete_custom_rule",
  description: "Permanently delete a custom rule by ID.",
  inputSchema: z.object({
    ruleId: z.string().uuid(),
  }),
  handler: async ({ ruleId }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const [rule] = await db
      .select({ id: customRules.id, name: customRules.name })
      .from(customRules)
      .where(and(eq(customRules.id, ruleId), eq(customRules.repoId, repoId)))

    if (!rule) {
      return { ok: false, message: `Custom rule ${ruleId} not found.` }
    }

    await db.delete(customRules).where(eq(customRules.id, ruleId))

    const summary = `Custom rule "${rule.name}" deleted`

    await logEvent({
      repoId,
      action: "rule_config_updated",
      severity: "info",
      description: summary,
      metadata: {
        customRuleId: ruleId,
        name: rule.name,
        operation: "deleted",
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return { ok: true, message: summary }
  },
})

const ALLOWED_CUSTOM_RULE_NODE_TYPES = new Set([
  "condition",
  "logic",
  "transform",
])

const editCustomRule = defineTool({
  name: "edit_custom_rule",
  description:
    "Edit a custom rule's definition graph using operations (add_node, edit_node, delete_node, add_edge, delete_edge). Only condition, logic, and transform node types are allowed. Clears simulation status and disables the rule after editing.",
  needsApproval: true,
  inputSchema: z.object({
    ruleId: z.string().uuid(),
    operations: workflowOperationsArraySchema.describe(
      "Array of operations to apply to the rule's definition graph"
    ),
  }),
  handler: async ({ ruleId, operations }, ctx) => {
    const repoId = requireRepoId(ctx)
    await assertRepoOwner(ctx.userId, repoId)

    const [rule] = await db
      .select()
      .from(customRules)
      .where(and(eq(customRules.id, ruleId), eq(customRules.repoId, repoId)))

    if (!rule) {
      return { ok: false, message: `Custom rule ${ruleId} not found.` }
    }

    const current = rule.definition ?? {
      nodes: [],
      edges: [],
      outputNodeId: "",
    }
    const {
      state: next,
      errors,
      warnings,
    } = applyWorkflowOperations(
      { nodes: current.nodes, edges: current.edges },
      operations
    )

    if (errors.length > 0) {
      return {
        ok: false,
        message: `Operations failed: ${errors.join("; ")}`,
        data: { errors, warnings },
      }
    }

    const invalidNodes = next.nodes.filter(
      (n) => !ALLOWED_CUSTOM_RULE_NODE_TYPES.has(n.type)
    )
    if (invalidNodes.length > 0) {
      const names = invalidNodes.map((n) => `${n.type}/${n.id}`).join(", ")
      return {
        ok: false,
        message: `Custom rules only support condition, logic, and transform nodes. Invalid: ${names}`,
      }
    }

    const updatedDefinition = {
      nodes: next.nodes,
      edges: next.edges,
      outputNodeId: current.outputNodeId,
    }

    await db
      .update(customRules)
      .set({
        definition: updatedDefinition as typeof rule.definition,
        simulatedAt: null,
        enabled: false,
        updatedAt: new Date(),
      })
      .where(eq(customRules.id, ruleId))

    const addedNodes = operations.filter((o) => o.op === "add_node").length
    const editedNodes = operations.filter((o) => o.op === "edit_node").length
    const deletedNodes = operations.filter((o) => o.op === "delete_node").length
    const addedEdges = operations.filter((o) => o.op === "add_edge").length
    const deletedEdges = operations.filter((o) => o.op === "delete_edge").length

    const parts: string[] = []
    if (addedNodes) parts.push(`${addedNodes} node(s) added`)
    if (editedNodes) parts.push(`${editedNodes} node(s) edited`)
    if (deletedNodes) parts.push(`${deletedNodes} node(s) deleted`)
    if (addedEdges) parts.push(`${addedEdges} edge(s) added`)
    if (deletedEdges) parts.push(`${deletedEdges} edge(s) deleted`)
    const summary = `Custom rule "${rule.name}" edited: ${parts.join(", ") || "no changes"}. Simulation cleared; rule disabled.`

    await logEvent({
      repoId,
      action: "rule_config_updated",
      severity: "info",
      description: summary,
      metadata: {
        customRuleId: ruleId,
        name: rule.name,
        operationCount: operations.length,
        updatedBy: ctx.userName ?? null,
        viaTool: true,
      },
    })

    return {
      ok: true,
      message: summary,
      data: {
        ruleId,
        nodeCount: next.nodes.length,
        edgeCount: next.edges.length,
        warnings: warnings.length > 0 ? warnings : undefined,
      },
    }
  },
})

export const customRuleTools: AnyToolDefinition[] = [
  listCustomRules,
  getCustomRule,
  createCustomRule,
  toggleCustomRule,
  updateCustomRuleAction,
  deleteCustomRule,
  editCustomRule,
]
