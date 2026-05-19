import { z } from "zod"

const addNodeSchema = z.object({
  op: z.literal("add_node"),
  type: z.enum([
    "trigger",
    "rule",
    "condition",
    "logic",
    "action",
    "delay",
    "transform",
  ]),
  subtype: z.string().min(1),
  id: z.string().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
})

const editNodeSchema = z.object({
  op: z.literal("edit_node"),
  id: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
})

const deleteNodeSchema = z.object({
  op: z.literal("delete_node"),
  id: z.string().min(1),
})

const addEdgeSchema = z.object({
  op: z.literal("add_edge"),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().optional(),
  targetHandle: z.string().optional(),
  id: z.string().optional(),
})

const deleteEdgeSchema = z.object({
  op: z.literal("delete_edge"),
  id: z.string().min(1),
})

export const workflowOperationSchema = z.discriminatedUnion("op", [
  addNodeSchema,
  editNodeSchema,
  deleteNodeSchema,
  addEdgeSchema,
  deleteEdgeSchema,
])

export type WorkflowOperation = z.infer<typeof workflowOperationSchema>

export const workflowOperationsArraySchema = z.array(workflowOperationSchema)
