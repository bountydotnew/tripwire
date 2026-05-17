import type {
	UIMessage,
	UIMessagePart,
	ToolUIPart,
	DynamicToolUIPart,
	ReasoningUIPart,
	UIDataTypes,
	UITools,
} from "ai";
import type { Spec } from "@json-render/core";
import type { RuleConfig } from "@tripwire/db";

export type {
	UIMessage,
	ToolUIPart,
	DynamicToolUIPart,
	ReasoningUIPart as ThinkingPart,
};

export type LegacyToolCallPart = {
	type: "tool-call";
	id?: string;
	toolCallId?: string;
	name?: string;
	arguments?: string;
	input?: unknown;
	state?: string;
	approval?: { id: string; approved?: boolean; reason?: string };
};

export type LegacyToolResultPart = {
	type: "tool-result";
	toolCallId?: string;
	id?: string;
	content?: string;
	state?: string;
};

export type LegacyThinkingPart = {
	type: "thinking";
	content?: string;
	text?: string;
};

export type MessagePart =
	| UIMessagePart<UIDataTypes, UITools>
	| LegacyToolCallPart
	| LegacyToolResultPart
	| LegacyThinkingPart;

export type ToolCallPart = ToolUIPart | DynamicToolUIPart | LegacyToolCallPart;
export type ToolResultPart = LegacyToolResultPart;

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
