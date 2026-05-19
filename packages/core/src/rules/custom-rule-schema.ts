import { z } from "zod"

const customRuleNodeTypeSchema = z.enum(["condition", "logic", "transform"])

const customRuleNodeSchema = z.object({
  id: z.string().min(1),
  type: customRuleNodeTypeSchema,
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.string(), z.unknown()),
})

const customRuleEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
  label: z.string().optional(),
  animated: z.boolean().optional(),
})

export const customRuleDefinitionSchema = z
  .object({
    nodes: z
      .array(customRuleNodeSchema)
      .min(1, "At least one node is required"),
    edges: z.array(customRuleEdgeSchema),
    outputNodeId: z.string().min(1, "An output node must be specified"),
  })
  .refine((def) => def.nodes.some((n) => n.id === def.outputNodeId), {
    message:
      "The output node was removed or disconnected. Right-click a condition node and set it as the output.",
  })

const customRuleActionSchema = z.enum(["block", "warn", "log", "threshold"])

const scopeOverrideSchema = z
  .object({
    pullRequests: z.boolean().optional(),
    issues: z.boolean().optional(),
    comments: z.boolean().optional(),
  })
  .optional()
  .nullable()

export const createCustomRuleSchema = z.object({
  repoId: z.string().uuid(),
  name: z
    .string()
    .min(1, "Name is required")
    .max(100, "Name must be 100 characters or fewer"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or fewer")
    .optional()
    .nullable(),
  definition: customRuleDefinitionSchema,
  action: customRuleActionSchema,
  thresholdCount: z.number().int().min(1).optional().nullable(),
  scopeOverride: scopeOverrideSchema,
  priority: z.number().int().min(0).default(0),
})

export const updateCustomRuleSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  definition: customRuleDefinitionSchema.optional(),
  action: customRuleActionSchema.optional(),
  thresholdCount: z.number().int().min(1).optional().nullable(),
  scopeOverride: scopeOverrideSchema,
  priority: z.number().int().min(0).optional(),
})

export type CreateCustomRuleInput = z.infer<typeof createCustomRuleSchema>
export type UpdateCustomRuleInput = z.infer<typeof updateCustomRuleSchema>
