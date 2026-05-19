import type { AnyToolDefinition } from "./registry"
import { ruleTools } from "./definitions/rules"
import { customRuleTools } from "./definitions/custom-rules"
import { listTools } from "./definitions/lists"
import { readTools } from "./definitions/reads"
import { guideTools } from "./definitions/guides"
import { workflowTools } from "./definitions/workflows"

export const tripwireTools: readonly AnyToolDefinition[] = [
  ...ruleTools,
  ...customRuleTools,
  ...listTools,
  ...readTools,
  ...guideTools,
  ...workflowTools,
]

export { SERVER_INSTRUCTIONS } from "./guides-content"
export { createChatTools, runToolForChat } from "./chat-adapter"
export { defineTool, makeSpec, filterToolsForSurface } from "./registry"
export type {
  AnyToolDefinition,
  JsonRenderSpec,
  MutationResult,
  ToolContext,
  ToolDefinition,
  ToolSurface,
} from "./registry"
