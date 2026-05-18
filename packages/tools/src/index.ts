import type { AnyToolDefinition } from "./registry";
import { ruleTools } from "./definitions/rules";
import { listTools } from "./definitions/lists";
import { readTools } from "./definitions/reads";
import { guideTools } from "./definitions/guides";

export const tripwireTools: readonly AnyToolDefinition[] = [
	...ruleTools,
	...listTools,
	...readTools,
	...guideTools,
];

export { SERVER_INSTRUCTIONS } from "./guides-content";
export { createChatTools, runToolForChat } from "./chat-adapter";
export { defineTool, makeSpec, filterToolsForSurface } from "./registry";
export type {
	AnyToolDefinition,
	JsonRenderSpec,
	MutationResult,
	ToolContext,
	ToolDefinition,
	ToolSurface,
} from "./registry";
