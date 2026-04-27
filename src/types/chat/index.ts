import type { UIMessage, MessagePart, ToolCallPart, ToolResultPart, ThinkingPart } from "@tanstack/ai-client";
import type { Spec } from "@json-render/core";
import type { RuleConfig } from "#/db/schema";

export type { UIMessage, MessagePart, ToolCallPart, ToolResultPart, ThinkingPart };

/** Re-export json-render Spec for tool result rendering */
export type { Spec as RenderSpec };

/** Serialized messages stored in DB and exchanged with API */
export type SerializedMessage = Record<string, unknown>;

export interface ActionResultData {
	success: boolean;
	message: string;
	action: string;
	username?: string;
}

/** A mutable copy of RuleConfig for dynamic field access in tool handlers */
export type MutableRuleConfig = {
	[K in keyof RuleConfig]: Record<string, unknown>;
};

/** Error shape from upstream providers (OpenRouter, OpenAI, etc.) */
export interface ProviderError {
	error?: {
		metadata?: { raw?: unknown };
		message?: string;
	};
	message?: string;
}
