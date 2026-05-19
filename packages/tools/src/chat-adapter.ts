import { tool as aiTool, type ToolSet } from "ai"
import { z } from "zod"
import {
  type AnyToolDefinition,
  type JsonRenderSpec,
  type ToolContext,
  type ToolDefinition,
  filterToolsForSurface,
  makeSpec,
} from "./registry"

/**
 * Run a tool's handler and apply its chatRender (or the default presenter).
 * Shared between the chat adapter (for model-driven calls) and any direct
 * invocation path (e.g. /api/tools/run for UI buttons).
 *
 * Throws on handler failure so the caller can decide how to surface it.
 */
export async function runToolForChat<TShape extends z.ZodRawShape, TOutput>(
  tool: ToolDefinition<TShape, TOutput>,
  args: z.infer<z.ZodObject<TShape>>,
  ctx: ToolContext
): Promise<JsonRenderSpec> {
  const output = await tool.handler(args, ctx)
  if (tool.chatRender) return tool.chatRender(output, args)
  return defaultChatRender(output, tool.name)
}

const specSchema = z.object({
  root: z.string(),
  elements: z.record(
    z.string(),
    z.object({
      type: z.string(),
      props: z.record(z.string(), z.unknown()),
      children: z.array(z.string()).optional(),
    })
  ),
})

/**
 * Convert a registry of tool definitions into the AI SDK tool set
 * the chat route expects (a record keyed by tool name).
 *
 * The wrapper does the schema cast once at the boundary so handlers see the
 * inferred type from their own zod schema, not `unknown`.
 */
export function createChatTools(
  ctx: ToolContext,
  tools: readonly AnyToolDefinition[]
): ToolSet {
  const chatTools: ToolSet = {}
  for (const tool of filterToolsForSurface(tools, "chat")) {
    chatTools[tool.name] = buildChatTool(tool, ctx)
  }
  return chatTools
}

function buildChatTool<TShape extends z.ZodRawShape, TOutput>(
  tool: ToolDefinition<TShape, TOutput>,
  ctx: ToolContext
) {
  return aiTool({
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: specSchema,
    needsApproval: tool.needsApproval,
    execute: async (rawArgs) => {
      const args = rawArgs as z.infer<z.ZodObject<TShape>>

      try {
        return await runToolForChat(tool, args, ctx)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return makeSpec("ActionResult", {
          success: false,
          message,
          action: tool.name,
        })
      }
    },
  })
}

/**
 * Fallback presenter for tools without an explicit chatRender. Produces an
 * ActionResult card. Reads `ok` and `message` from the output if present.
 */
function defaultChatRender(output: unknown, action: string): JsonRenderSpec {
  if (output && typeof output === "object") {
    const obj = output as Record<string, unknown>
    const ok = typeof obj.ok === "boolean" ? obj.ok : true
    const message = typeof obj.message === "string" ? obj.message : "Done."
    return makeSpec("ActionResult", { success: ok, message, action })
  }
  return makeSpec("ActionResult", {
    success: true,
    message: typeof output === "string" ? output : "Done.",
    action,
  })
}
