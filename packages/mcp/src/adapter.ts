import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import {
  type AnyToolDefinition,
  type ToolContext,
  filterToolsForSurface,
} from "@tripwire/tools"

/**
 * Register a tool registry against an MCP server.
 *
 * For each tool that opts into the "mcp" surface, this:
 *   1. Builds the input shape the model sees. Tools with needsRepo !== false
 *      get a `repoId: uuid` field prepended; the model must provide it.
 *   2. On call, extracts repoId into ctx, hands the rest to the handler.
 *   3. Stringifies the handler output as a text content block.
 */
export function registerMcpTools(
  server: McpServer,
  userId: string,
  tools: readonly AnyToolDefinition[]
): void {
  for (const tool of filterToolsForSurface(tools, "mcp")) {
    const repoScoped = tool.needsRepo !== false
    const baseShape = tool.inputSchema.shape as z.ZodRawShape
    const fullShape: z.ZodRawShape = repoScoped
      ? { repoId: z.string().uuid(), ...baseShape }
      : baseShape

    server.tool(
      tool.name,
      tool.description,
      fullShape,
      async (rawArgs: Record<string, unknown>) => {
        try {
          let handlerArgs: Record<string, unknown>
          let repoId: string | undefined
          if (repoScoped) {
            const { repoId: r, ...rest } = rawArgs as {
              repoId: string
            } & Record<string, unknown>
            repoId = r
            handlerArgs = rest
          } else {
            handlerArgs = rawArgs
          }

          const ctx: ToolContext = { userId, repoId }
          const args = tool.inputSchema.parse(handlerArgs)
          const output = await tool.handler(args, ctx)

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(output, null, 2),
              },
            ],
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return {
            content: [{ type: "text" as const, text: `Error: ${message}` }],
            isError: true,
          }
        }
      }
    )
  }
}
