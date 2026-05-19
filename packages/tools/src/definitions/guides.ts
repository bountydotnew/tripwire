import { z } from "zod"
import { type AnyToolDefinition, defineTool } from "../registry"
import { GUIDES } from "../guides-content"

const GUIDE_TOPICS = Object.keys(GUIDES) as [string, ...string[]]

const getGuide = defineTool({
  name: "get_guide",
  description: `Return Tripwire MCP documentation for a topic. Topics: ${GUIDE_TOPICS.join(", ")}. Use for conceptual docs (event taxonomy, list semantics). Tool schemas already document their own inputs — you don't need a guide call to figure out a specific tool.`,
  surfaces: ["mcp"],
  needsRepo: false,
  inputSchema: z.object({
    topic: z.enum(GUIDE_TOPICS),
  }),
  handler: async ({ topic }) => {
    const body = GUIDES[topic]
    if (!body) throw new Error(`Unknown guide topic: ${topic}`)
    return { topic, body }
  },
})

export const guideTools: AnyToolDefinition[] = [getGuide]
