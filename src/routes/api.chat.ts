import { createFileRoute } from "@tanstack/react-router";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { createTripwireTools } from "#/lib/ai/tools";
import { buildSystemPrompt } from "#/lib/ai/prompt";
import { createContext } from "#/integrations/trpc/init";
import { autumn } from "#/lib/autumn";
import { db } from "#/db";
import { organizations, repositories } from "#/db/schema";
import { eq } from "drizzle-orm";

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				// Authenticate user
				const ctx = await createContext({ headers: request.headers });
				if (!ctx.user) {
					return new Response(
						JSON.stringify({ error: "Unauthorized" }),
						{ status: 401, headers: { "Content-Type": "application/json" } },
					);
				}

				try {
					// Check AI message quota (auto-create customer if not found)
					let quota: any;
					try {
						quota = await autumn.check({
							customerId: ctx.user.id,
							featureId: "ai_messages",
							withPreview: true,
						});
					} catch (checkErr: any) {
						if (checkErr?.statusCode === 404) {
							// Existing user without Autumn record, create and retry
							await autumn.customers.create({ customerId: ctx.user.id });
							quota = await autumn.check({
								customerId: ctx.user.id,
								featureId: "ai_messages",
								withPreview: true,
							});
						} else {
							// Autumn is down or misconfigured, allow chat to proceed
							console.error("[Tripwire] Autumn check failed, allowing request:", checkErr);
							quota = { allowed: true };
						}
					}

					if (!quota?.allowed) {
						const code = quota?.code ?? "usage_limit";
						return new Response(
							JSON.stringify({
								error: "quota_exhausted",
								code,
								message: code === "usage_limit"
									? "You've used all your AI messages this month."
									: "AI chat is not included in your current plan.",
							}),
							{
								status: 429,
								headers: {
									"Content-Type": "application/json",
									"X-Quota-Code": code,
								},
							},
						);
					}

					const { messages: rawMessages, repoId, conversationId, currentPage } = await request.json();

					// Sanitize corrupted messages from TanStack AI
					// TODO: Remove when TanStack AI fixes tool approval state management
					const messages = sanitizeMessages(rawMessages);

					// Debug: log message structure to diagnose tool errors
					if (process.env.NODE_ENV !== "production") {
						const summary = messages.map((m: any, i: number) => {
							const parts = m.parts?.map((p: any) => {
								const id = p.toolCallId || p.id;
								const idStr = id ? `(${String(id).slice(0, 8)})` : "";
								const nameStr = p.name ? `:${p.name}` : "";
								const stateStr = p.state ? `[${p.state}]` : "";
								return `${p.type}${idStr}${nameStr}${stateStr}`;
							}).join(", ") ?? "no-parts";
							return `  [${i}] ${m.role}: ${parts}`;
						}).join("\n");
						console.log(`[Chat] ${messages.length} messages:\n${summary}`);
					}

					let resolvedRepoId = repoId as string | undefined;

					// Backward compatibility for the new UI flow where repo picker was removed:
					// if no repoId is sent, fall back to the first available repo owned by the user.
					if (!resolvedRepoId) {
						const userOrgs = await db
							.select({ id: organizations.id })
							.from(organizations)
							.where(eq(organizations.ownerId, ctx.user.id));

						for (const org of userOrgs) {
							const [firstRepo] = await db
								.select({ id: repositories.id })
								.from(repositories)
								.where(eq(repositories.orgId, org.id))
								.limit(1);

							if (firstRepo?.id) {
								resolvedRepoId = firstRepo.id;
								break;
							}
						}
					}

					if (!resolvedRepoId) {
						return new Response(
							JSON.stringify({
								error: "No repositories available. Connect a repository to start chatting.",
							}),
							{ status: 400, headers: { "Content-Type": "application/json" } },
						);
					}

					// Get repo info for context
					const [repo] = await db
						.select()
						.from(repositories)
						.where(eq(repositories.id, resolvedRepoId))
						.limit(1);

					const repoName = repo?.fullName ?? "Unknown Repository";

					// Build system prompt with context
					const systemPrompt = buildSystemPrompt({
						repoName,
						userName: ctx.user.name ?? ctx.user.email ?? "User",
						currentPage: currentPage ?? "/home",
					});

					// Create tools with context
					const tools = createTripwireTools({
						userId: ctx.user.id,
						userName: ctx.user.name ?? ctx.user.email ?? "User",
						repoId: resolvedRepoId,
					});

					// Execute approved tool-calls that haven't been executed yet.
					// When a tool has needsApproval, the client shows an approval UI.
					// After approval, the client sends the messages back with the
					// tool-call marked as "approval-responded" but without results.
					// The server must execute them and inject results before chat().
					await executeApprovedTools(messages, tools);

					// Create streaming chat response with concise error logging
					// (TanStack AI's default ConsoleLogger uses console.dir with
					// depth:null, dumping entire HTTP response objects on errors)
					const stream = chat({
						adapter: openRouterText("openai/gpt-4o-mini"),
						messages,
						tools,
						systemPrompts: [systemPrompt],
						conversationId,
						debug: {
							errors: true,
							provider: false,
							output: false,
							middleware: false,
							tools: false,
							agentLoop: false,
							config: false,
							request: false,
							logger: {
								debug: (msg: string) => console.debug(msg),
								info: (msg: string) => console.info(msg),
								warn: (msg: string) => console.warn(msg),
								error: (msg: string, meta?: Record<string, unknown>) => {
									if (meta?.error) {
										const err = meta.error as any;
										const raw = err?.error?.metadata?.raw ?? err?.error?.message ?? err?.message ?? "Unknown";
										console.error(msg, typeof raw === "string" ? raw : JSON.stringify(raw));
									} else {
										console.error(msg, meta ?? "");
									}
								},
							},
						},
					});

					// Track AI message usage (fire-and-forget)
					autumn.track({
						customerId: ctx.user.id,
						featureId: "ai_messages",
						value: 1,
					}).catch((err) => {
						console.error("[Tripwire] Failed to track AI message usage:", err);
					});

					return toServerSentEventsResponse(stream);
				} catch (error: any) {
					// Log concise error, not the full stack/object dump
					const errMsg = error?.error?.message
						|| error?.message
						|| "Unknown error";
					const provider = error?.error?.metadata?.provider_name;
					const raw = error?.error?.metadata?.raw;
					console.error(
						`[Chat API] ${provider ? provider + ": " : ""}${errMsg}`,
						raw ? `\n${raw}` : "",
					);
					return new Response(
						JSON.stringify({
							error: errMsg,
						}),
						{ status: 500, headers: { "Content-Type": "application/json" } },
					);
				}
			},
		},
	},
});

/**
 * Execute approved tool-calls that the client approved but the server
 * hasn't executed yet. Mutates the messages array in-place by adding
 * tool-result parts next to each approved tool-call.
 */
async function executeApprovedTools(messages: any[], tools: any[]) {
	// Build a name→execute map from the tools array
	const toolMap = new Map<string, (args: any) => Promise<any>>();
	for (const tool of tools) {
		if (tool.name && tool.execute) {
			toolMap.set(tool.name, tool.execute);
		}
	}

	// Find the last assistant message
	let lastAssistant: any = null;
	for (let i = messages.length - 1; i >= 0; i--) {
		if (messages[i].role === "assistant") {
			lastAssistant = messages[i];
			break;
		}
	}
	if (!lastAssistant?.parts) return;

	// Collect approved tool-calls without matching results
	const resultIds = new Set<string>();
	for (const part of lastAssistant.parts) {
		if (part.type === "tool-result") {
			const id = part.toolCallId || part.id;
			if (id) resultIds.add(id);
		}
	}

	const pendingCalls = lastAssistant.parts.filter((part: any) => {
		if (part.type !== "tool-call") return false;
		if (part.state !== "approval-responded") return false;
		if (!part.approval?.approved) return false;
		const id = part.toolCallId || part.id;
		return id && !resultIds.has(id);
	});

	if (pendingCalls.length === 0) return;

	// Execute each approved tool and append results
	for (const call of pendingCalls) {
		const execute = toolMap.get(call.name);
		if (!execute) continue;

		const id = call.toolCallId || call.id;
		let args: any = {};
		if (call.arguments) {
			try { args = JSON.parse(call.arguments); } catch {}
		} else if (call.input) {
			args = call.input;
		}

		try {
			const output = await execute(args);
			// Mark the call as complete
			call.state = "input-complete";
			// Append the result
			lastAssistant.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: typeof output === "string" ? output : JSON.stringify(output),
				state: "complete",
			});
		} catch (err: any) {
			call.state = "input-complete";
			lastAssistant.parts.push({
				type: "tool-result",
				toolCallId: id,
				content: JSON.stringify({ error: err?.message ?? "Tool execution failed" }),
				state: "error",
			});
		}
	}
}

/**
 * Clean up corrupted TanStack AI messages before sending to the model.
 *
 * OpenAI requires every role:"tool" message to follow an assistant message
 * containing the matching tool_calls entry. TanStack AI's approval flow
 * can produce orphaned tool-results. We aggressively strip them.
 */
function sanitizeMessages(rawMessages: any[]): any[] {
	// Pass 1: Merge split assistant messages. TanStack AI can put a tool-call
	// and its tool-result in separate assistant messages. OpenAI requires them
	// together, so merge tool-result-only assistant messages into the preceding
	// assistant message that contains the matching tool-call.
	const merged: any[] = [];
	for (const msg of rawMessages) {
		merged.push(msg);
	}
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
				merged[j] = {
					...merged[j],
					parts: [...merged[j].parts, ...msg.parts],
				};
				merged.splice(i, 1);
				break;
			}
		}
	}

	// Pass 2: Build set of completed tool-call IDs by checking each message
	// for calls that have a matching result IN THE SAME message. This prevents
	// a new tool-call from passing because an older call with the same ID had
	// a result in a different message. Approved tool-calls already have results
	// injected by executeApprovedTools() before sanitization runs.
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
				if (id && msgResultIds.has(id)) {
					completedCallIds.add(id);
				}
			}
		}
	}

	// Pass 3: Strip anything that isn't a completed call/result pair.
	// This removes: pending approvals, orphaned results, nameless calls,
	// and tool-calls whose results are from a different (older) turn.
	return merged
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

	// Pass 4: Safety net — strip tool-calls from ALL assistant messages
	// that don't have matching tool-results in the same message.
	// Approved calls already have results from executeApprovedTools().
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

	return result.filter((msg: any) => {
		if (msg.parts && msg.parts.length === 0) return false;
		return true;
	});
}
