import type { UIMessage } from "ai";
import type { ToolSet } from "ai";

export type ChatHistoryMessage = UIMessage | Record<string, any>;

export function mergeClientMessagesWithStored(
	clientMessages: ChatHistoryMessage[],
	storedMessages: ChatHistoryMessage[],
): ChatHistoryMessage[] {
	if (storedMessages.length === 0) {
		return clientMessages
			.filter((message) => message.role === "user")
			.map((message) => cloneMessage(message));
	}

	const merged = storedMessages.map((message) => cloneMessage(message));
	const mergedById = new Map<string, any>();
	for (const message of merged) {
		if (typeof message.id === "string") mergedById.set(message.id, message);
	}

	for (const clientMessage of clientMessages) {
		const existing = typeof clientMessage.id === "string"
			? mergedById.get(clientMessage.id)
			: undefined;

		if (!existing) {
			if (clientMessage.role === "user") {
				merged.push(cloneMessage(clientMessage));
			}
			continue;
		}

		if (existing.role === "assistant") {
			applyApprovalResponses(existing, clientMessage);
		}
	}

	return merged;
}

function applyApprovalResponses(storedMessage: any, clientMessage: any): void {
	if (!Array.isArray(storedMessage.parts) || !Array.isArray(clientMessage.parts)) return;

	const storedApprovals = new Map<string, any>();
	for (const part of storedMessage.parts) {
		const id = getPartToolCallId(part);
		if (!id || part.state !== "approval-requested" || !part.approval?.id) continue;
		storedApprovals.set(id, part);
	}

	for (const clientPart of clientMessage.parts) {
		const id = getPartToolCallId(clientPart);
		if (!id || clientPart.state !== "approval-responded") continue;
		const storedPart = storedApprovals.get(id);
		if (!storedPart) continue;
		if (clientPart.approval?.id !== storedPart.approval?.id) continue;
		storedPart.state = "approval-responded";
		storedPart.approval = {
			...storedPart.approval,
			approved: Boolean(clientPart.approval?.approved),
			...(clientPart.approval?.reason ? { reason: clientPart.approval.reason } : {}),
		};
	}
}

/**
 * Clean up UI messages before sending to the model.
 *
 * Keeps completed AI SDK v6 tool parts, converts old TanStack-style completed
 * tool-call/result pairs, and drops pending or orphaned tool state unless the
 * user just responded to a stored approval.
 */
export function sanitizeMessages(rawMessages: ChatHistoryMessage[], tools?: ToolSet): UIMessage[] {
	const merged: any[] = [...rawMessages];

	// Merge split assistant messages: tool-result-only messages get folded
	// into the preceding assistant message that owns the matching tool-call.
	for (let i = merged.length - 1; i >= 0; i--) {
		const msg = merged[i];
		if (msg.role !== "assistant" || !msg.parts) continue;

		const hasOnlyResults = msg.parts.length > 0 && msg.parts.every(
			(p: any) => p.type === "tool-result",
		);
		if (!hasOnlyResults) continue;

		for (let j = i - 1; j >= 0; j--) {
			if (merged[j].role !== "assistant" || !merged[j].parts) continue;
			const hasMatchingCall = merged[j].parts.some(
				(p: any) =>
					p.type === "tool-call" &&
					msg.parts.some(
						(r: any) => (r.toolCallId || r.id) === (p.toolCallId || p.id),
					),
			);
			if (hasMatchingCall) {
				merged[j] = { ...merged[j], parts: [...merged[j].parts, ...msg.parts] };
				merged.splice(i, 1);
				break;
			}
		}
	}

	// Build a set of tool-call IDs that have a matching result IN THE SAME
	// message. Anything else (pending approvals, orphaned results, cross-turn
	// pairs) gets stripped below.
	const completedCallIds = new Set<string>();
	for (const msg of merged) {
		if (!msg.parts) continue;
		const msgResultIds = new Set<string>();
		for (const part of msg.parts) {
			if (isLegacyToolResult(part)) {
				const id = part.toolCallId || part.id;
				if (id) msgResultIds.add(id);
			}
		}
		for (const part of msg.parts) {
			if (isLegacyToolCall(part) && part.name) {
				const id = part.toolCallId || part.id;
				if (id && msgResultIds.has(id)) completedCallIds.add(id);
			}
		}
	}

	const result = merged
		.map((msg: any) => {
			if (msg.role === "tool") {
				if (!msg.tool_call_id || !completedCallIds.has(msg.tool_call_id)) return null;
				return msg;
			}
			if (!msg.parts) return msg;

			const cleanParts = msg.parts
				.filter((part: any) => {
					if (isLegacyToolCall(part)) {
						if (!part.name) return false;
						const id = part.toolCallId || part.id;
						return id && completedCallIds.has(id);
					}
					if (isLegacyToolResult(part)) {
						const id = part.toolCallId || part.id;
						return id && completedCallIds.has(id);
					}
					return true;
				})
				.map((part: any) => {
					const id = part.toolCallId || part.id;
					if (isLegacyToolCall(part) && completedCallIds.has(id)) {
						if (part.state !== "input-complete" && part.state !== "approval-responded") {
							return { ...part, state: "input-complete" };
						}
					}
					if (isLegacyToolResult(part) && completedCallIds.has(id)) {
						if (part.state !== "complete" && part.state !== "error") {
							return { ...part, state: "complete" };
						}
					}
					return part;
				});

			return { ...msg, parts: cleanParts };
		})
		.filter((msg: any) => {
			if (msg === null) return false;
			if (msg.parts && msg.parts.length === 0) return false;
			return true;
		});

	// Safety net: drop legacy tool calls from assistant messages without
	// matching results. AI SDK approval parts are preserved above.
	for (const msg of result) {
		if (msg.role !== "assistant" || !msg.parts) continue;
		const resultIds = new Set<string>();
		for (const part of msg.parts) {
			if (isLegacyToolResult(part)) {
				const id = part.toolCallId || part.id;
				if (id) resultIds.add(id);
			}
		}
		msg.parts = msg.parts.filter((part: any) => {
			if (!isLegacyToolCall(part)) return true;
			const id = part.toolCallId || part.id;
			return id && resultIds.has(id);
		});
	}

	return result
		.map((msg: any) => normalizeMessageForAiSdk(msg, tools))
		.filter((msg: UIMessage | null): msg is UIMessage => !!msg && msg.parts.length > 0);
}

function normalizeMessageForAiSdk(message: any, tools?: ToolSet): UIMessage | null {
	if (!message || typeof message !== "object") return null;
	if (!["system", "user", "assistant"].includes(message.role)) return null;

	const parts = Array.isArray(message.parts)
		? normalizeParts(message.parts, tools)
		: typeof message.content === "string"
			? [{ type: "text", text: message.content }]
			: [];

	return {
		id: typeof message.id === "string" ? message.id : crypto.randomUUID(),
		role: message.role,
		parts,
	};
}

function normalizeParts(parts: any[], tools?: ToolSet): any[] {
	const legacyResults = new Map<string, any>();
	for (const part of parts) {
		if (!isLegacyToolResult(part)) continue;
		const id = part.toolCallId || part.id;
		if (id) legacyResults.set(id, part);
	}

	const normalized: any[] = [];
	for (const part of parts) {
		if (part?.type === "text") {
			const text = part.text ?? part.content;
			if (typeof text === "string" && text.length > 0) {
				normalized.push({ type: "text", text });
			}
			continue;
		}

		if (part?.type === "thinking" || part?.type === "reasoning") {
			const text = part.text ?? part.content;
			if (typeof text === "string" && text.length > 0) {
				normalized.push({ type: "reasoning", text, state: "done" });
			}
			continue;
		}

		if (isAiSdkToolPart(part)) {
			const toolName = getPartToolName(part);
			if (toolName && (!tools || tools[toolName])) {
				normalized.push(part);
			}
			continue;
		}

		if (isLegacyToolCall(part) && part.name) {
			const id = getPartToolCallId(part);
			const result = id ? legacyResults.get(id) : undefined;
			if (!id || !result || (tools && !tools[part.name])) continue;
			normalized.push({
				type: `tool-${part.name}`,
				toolCallId: id,
				state: result.state === "error" ? "output-error" : "output-available",
				input: parseToolInput(part),
				...(result.state === "error"
					? { errorText: parseToolResultError(result) }
					: { output: parseToolResultOutput(result) }),
				...(part.approval ? { approval: part.approval } : {}),
			});
		}
	}

	return normalized;
}

function cloneMessage(message: ChatHistoryMessage): any {
	return JSON.parse(JSON.stringify(message));
}

function isLegacyToolCall(part: any): boolean {
	return part?.type === "tool-call";
}

function isLegacyToolResult(part: any): boolean {
	return part?.type === "tool-result";
}

function isAiSdkToolPart(part: any): boolean {
	return part?.type === "dynamic-tool"
		|| (typeof part?.type === "string" && part.type.startsWith("tool-") && part.type !== "tool-call");
}

function getPartToolName(part: any): string | undefined {
	if (part?.type === "dynamic-tool") return part.toolName;
	if (typeof part?.type === "string" && part.type.startsWith("tool-")) {
		return part.type.slice("tool-".length);
	}
	return part?.name;
}

function getPartToolCallId(part: any): string | undefined {
	return typeof part?.toolCallId === "string"
		? part.toolCallId
		: typeof part?.id === "string"
			? part.id
			: undefined;
}

function parseToolInput(part: any): Record<string, unknown> {
	if (part?.input && typeof part.input === "object") return part.input;
	if (typeof part?.arguments !== "string") return {};
	try {
		return JSON.parse(part.arguments);
	} catch {
		return {};
	}
}

function parseToolResultOutput(part: any): unknown {
	if (part?.output !== undefined) return part.output;
	if (typeof part?.content !== "string") return part?.content ?? null;
	try {
		return JSON.parse(part.content);
	} catch {
		return part.content;
	}
}

function parseToolResultError(part: any): string {
	const output = parseToolResultOutput(part);
	if (output && typeof output === "object" && "error" in output) {
		return String((output as { error: unknown }).error);
	}
	return typeof output === "string" ? output : "Tool execution failed";
}
