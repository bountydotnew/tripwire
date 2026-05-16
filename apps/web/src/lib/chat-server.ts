import type { ChatMiddleware } from "@tanstack/ai";
import {
	hashArgs,
	signApprovalToken,
	verifyApprovalToken,
} from "@tripwire/ai";

export interface ApprovalSessionContext {
	userId: string;
	conversationId: string;
	repoId: string;
}

/**
 * Replaces the opaque `approval.id` on `approval-requested` chunks with an
 * HMAC-signed token bound to {toolCallId, userId, conversationId, repoId,
 * name, argsHash}. The token round-trips through the client and is verified
 * by executeApprovedTools on the next request — synthetic
 * "approval-responded" tool-calls can't be forged without BETTER_AUTH_SECRET.
 */
export function createApprovalSignerMiddleware(
	session: ApprovalSessionContext,
): ChatMiddleware {
	return {
		name: "approval-signer",
		onChunk(_ctx, chunk) {
			if (chunk.type !== "CUSTOM") return;
			if ((chunk as any).name !== "approval-requested") return;
			const value = (chunk as any).value;
			if (!value || typeof value !== "object") return;
			const { toolCallId, toolName, input, approval } = value;
			if (!toolCallId || !toolName || !approval?.id) return;

			const token = signApprovalToken({
				toolCallId,
				userId: session.userId,
				conversationId: session.conversationId,
				repoId: session.repoId,
				name: toolName,
				argsHash: hashArgs(input ?? {}),
			});

			return {
				...chunk,
				value: {
					...value,
					approval: { ...approval, id: token },
				},
			} as typeof chunk;
		},
	};
}

/**
 * Execute approved tool-calls that the client approved but the server hasn't
 * executed yet. Mutates `messages` in-place, adding tool-result parts next to
 * each approved tool-call. Tool-calls without a valid server-signed token get
 * an error tool-result and are not executed.
 */
export async function executeApprovedTools(
	messages: any[],
	tools: any[],
	session: ApprovalSessionContext,
): Promise<{ mutated: boolean }> {
	const toolMap = new Map<string, (args: any) => Promise<any>>();
	for (const tool of tools) {
		if (tool.name && tool.execute) toolMap.set(tool.name, tool.execute);
	}

	const pendingCalls: Array<{ call: any; message: any }> = [];
	for (const msg of messages) {
		if (msg.role !== "assistant" || !msg.parts) continue;
		const msgResultIds = new Set<string>();
		for (const part of msg.parts) {
			if (part.type === "tool-result") {
				const id = part.toolCallId || part.id;
				if (id) msgResultIds.add(id);
			}
		}
		for (const part of msg.parts) {
			if (part.type !== "tool-call") continue;
			if (part.state !== "approval-responded") continue;
			if (!part.approval?.approved) continue;
			const id = part.toolCallId || part.id;
			if (id && !msgResultIds.has(id)) {
				pendingCalls.push({ call: part, message: msg });
			}
		}
	}

	if (pendingCalls.length === 0) return { mutated: false };

	console.log(`[executeApproved] processing ${pendingCalls.length} approved tools: ${pendingCalls.map((p) => p.call.name).join(", ")}`);

	for (const { call, message } of pendingCalls) {
		const id = call.toolCallId || call.id;
		let args: any = {};
		if (call.arguments) {
			try { args = JSON.parse(call.arguments); } catch {}
		} else if (call.input) {
			args = call.input;
		}

		const token: string | undefined = call.approval?.id;
		if (!token) {
			console.warn(`[executeApproved] rejecting ${call.name} (${id}): missing approval signature`);
			call.state = "input-complete";
			message.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: JSON.stringify({ error: "approval_signature_missing" }),
				state: "error",
			});
			continue;
		}

		const ok = verifyApprovalToken(token, {
			toolCallId: id,
			userId: session.userId,
			conversationId: session.conversationId,
			repoId: session.repoId,
			name: call.name,
			argsHash: hashArgs(args),
		});

		if (!ok) {
			console.warn(`[executeApproved] rejecting ${call.name} (${id}): invalid approval signature`);
			call.state = "input-complete";
			message.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: JSON.stringify({ error: "approval_signature_invalid" }),
				state: "error",
			});
			continue;
		}

		const execute = toolMap.get(call.name);
		if (!execute) continue;

		try {
			const output = await execute(args);
			call.state = "input-complete";
			message.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: typeof output === "string" ? output : JSON.stringify(output),
				state: "complete",
			});
		} catch (err: any) {
			call.state = "input-complete";
			message.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: JSON.stringify({ error: err?.message ?? "Tool execution failed" }),
				state: "error",
			});
		}
	}

	return { mutated: true };
}

/**
 * Clean up TanStack AI messages before sending to the model.
 *
 * OpenAI requires every role:"tool" message to follow an assistant message
 * containing the matching tool_calls entry. TanStack AI's approval flow can
 * produce orphaned tool-results, split assistant messages, or pending
 * approvals — this aggressively merges and strips them.
 */
export function sanitizeMessages(rawMessages: any[]): any[] {
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
			if (part.type === "tool-result") {
				const id = part.toolCallId || part.id;
				if (id) msgResultIds.add(id);
			}
		}
		for (const part of msg.parts) {
			if (part.type === "tool-call" && part.name) {
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
					if (part.type === "tool-call") {
						if (!part.name) return false;
						const id = part.toolCallId || part.id;
						return id && completedCallIds.has(id);
					}
					if (part.type === "tool-result") {
						const id = part.toolCallId || part.id;
						return id && completedCallIds.has(id);
					}
					return true;
				})
				.map((part: any) => {
					const id = part.toolCallId || part.id;
					if (part.type === "tool-call" && completedCallIds.has(id)) {
						if (part.state !== "input-complete" && part.state !== "approval-responded") {
							return { ...part, state: "input-complete" };
						}
					}
					if (part.type === "tool-result" && completedCallIds.has(id)) {
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

	// Safety net: drop tool-calls from assistant messages without matching
	// results. Approved calls already have results from executeApprovedTools().
	for (const msg of result) {
		if (msg.role !== "assistant" || !msg.parts) continue;
		const resultIds = new Set<string>();
		for (const part of msg.parts) {
			if (part.type === "tool-result") {
				const id = part.toolCallId || part.id;
				if (id) resultIds.add(id);
			}
		}
		msg.parts = msg.parts.filter((part: any) => {
			if (part.type !== "tool-call") return true;
			const id = part.toolCallId || part.id;
			return id && resultIds.has(id);
		});
	}

	return result.filter((msg: any) => !(msg.parts && msg.parts.length === 0));
}
