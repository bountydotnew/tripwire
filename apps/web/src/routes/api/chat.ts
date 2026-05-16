import { createFileRoute } from "@tanstack/react-router";
import {
	chat,
	toServerSentEventsResponse,
	maxIterations,
} from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { webSearchTool } from "@tanstack/ai-openrouter/tools";
import { useRequest } from "nitro/context";
import type { RequestLogger } from "evlog";
import { createChatTools, tripwireTools } from "@tripwire/tools";
import { createCreditMiddleware } from "@tripwire/ai/credit-middleware";
import { buildSystemPrompt } from "@tripwire/ai";
import { createContext, assertRepoOwner } from "#/integrations/trpc/init";
import { autumn } from "@tripwire/auth/autumn";
import { db } from "@tripwire/db/client";
import { conversations, organizations, repositories } from "@tripwire/db";
import { and, eq } from "drizzle-orm";
import type { ProviderError } from "#/types/chat";
import {
	createApprovalSignerMiddleware,
	executeApprovedTools,
	sanitizeMessages,
} from "#/lib/chat-server";

function getRequestLog(): RequestLogger | undefined {
	try {
		const req = useRequest() as { context?: { log?: RequestLogger } } | undefined;
		return req?.context?.log;
	} catch {
		return undefined;
	}
}

async function resolveRepoIdForUser(userId: string): Promise<string | undefined> {
	const userOrgs = await db
		.select({ id: organizations.id })
		.from(organizations)
		.where(eq(organizations.ownerId, userId));

	for (const org of userOrgs) {
		const [firstRepo] = await db
			.select({ id: repositories.id })
			.from(repositories)
			.where(eq(repositories.orgId, org.id))
			.limit(1);
		if (firstRepo?.id) return firstRepo.id;
	}
	return undefined;
}

function jsonError(status: number, body: Record<string, unknown>, extraHeaders?: Record<string, string>) {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "Content-Type": "application/json", ...extraHeaders },
	});
}

async function checkQuota(userId: string) {
	try {
		return await autumn.check({
			customerId: userId,
			featureId: "ai_credits",
			withPreview: true,
		});
	} catch (checkErr: any) {
		const isNotFound = checkErr?.statusCode === 404
			|| checkErr?.code === "customer_not_found"
			|| checkErr?.body?.code === "customer_not_found"
			|| String(checkErr?.message).includes("not found");
		if (!isNotFound) throw checkErr;
		await autumn.customers.getOrCreate({ customerId: userId });
		return autumn.check({
			customerId: userId,
			featureId: "ai_credits",
			withPreview: true,
		});
	}
}

export const Route = createFileRoute("/api/chat")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const ctx = await createContext({ headers: request.headers });
				if (!ctx.user) return jsonError(401, { error: "Unauthorized" });

				try {
					let quota: any;
					try {
						quota = await checkQuota(ctx.user.id);
					} catch (checkErr) {
						// Autumn down/misconfigured: fail closed rather than grant free credits.
						console.error("[Tripwire] Autumn check failed, denying request:", checkErr);
						return jsonError(429, {
							error: "quota_check_failed",
							code: "quota_check_failed",
							message: "Could not verify your AI credits. Try again shortly.",
						});
					}

					if (!quota?.allowed) {
						const code = quota?.code ?? "usage_limit";
						return jsonError(429, {
							error: "quota_exhausted",
							code,
							message: code === "usage_limit"
								? "You've used all your AI credits this month."
								: "AI chat is not included in your current plan.",
						}, { "X-Quota-Code": code });
					}

					const { messages: rawMessages, repoId, conversationId, currentPage } = await request.json();

					// If the client supplied a conversationId AND a row already exists for it,
					// verify the row belongs to this user. Without this check the endpoint
					// trusts the body, so a user could attach their messages to someone else's
					// chat. New chats race with trpc.chats.create so the row may not exist
					// yet — only block when the row exists and is owned by a different user.
					if (conversationId && typeof conversationId === "string") {
						const [existing] = await db
							.select({ userId: conversations.userId })
							.from(conversations)
							.where(eq(conversations.id, conversationId))
							.limit(1);
						if (existing && existing.userId !== ctx.user.id) {
							return jsonError(403, { error: "conversation_not_accessible" });
						}
					}

					const resolvedRepoId = (repoId as string | undefined)
						?? await resolveRepoIdForUser(ctx.user.id);

					if (!resolvedRepoId) {
						return jsonError(400, {
							error: "No repositories available. Connect a repository to start chatting.",
						});
					}

					try {
						await assertRepoOwner(ctx.user.id, resolvedRepoId);
					} catch {
						return jsonError(403, { error: "repo_not_accessible" });
					}

					const [repo] = await db
						.select()
						.from(repositories)
						.where(eq(repositories.id, resolvedRepoId))
						.limit(1);

					const systemPrompt = buildSystemPrompt({
						repoName: repo?.fullName ?? "Unknown Repository",
						userName: ctx.user.name ?? ctx.user.email ?? "User",
						currentPage: currentPage ?? "/home",
					});

					const aiModel = process.env.TRIPWIRE_AI_MODEL || "openai/gpt-5.4";

					getRequestLog()?.set({
						ai: {
							model: aiModel,
							conversationId,
							repoId: resolvedRepoId,
							currentPage: currentPage ?? "/home",
						},
					});

					const tools = createChatTools(
						{
							userId: ctx.user.id,
							userName: ctx.user.name ?? ctx.user.email ?? "User",
							repoId: resolvedRepoId,
						},
						tripwireTools,
					);

					// Run executeApprovedTools BEFORE sanitize. sanitize strips tool-calls
					// without a paired tool-result in the same message — for an
					// approval-responded call the result doesn't exist until
					// executeApprovedTools produces it. Sanitize-first would wipe the
					// approved call and the model would re-propose the same tool on every
					// iteration (the approval-loop bug).
					const approvalResult = await executeApprovedTools(rawMessages, tools, {
						userId: ctx.user.id,
						conversationId: String(conversationId ?? ""),
						repoId: resolvedRepoId,
					});

					// Persist approval cleanup immediately — otherwise the client's eventual
					// saveMessages overwrites our cleanup with the original stale state, and
					// the same calls get re-rejected on every request.
					if (approvalResult.mutated && typeof conversationId === "string") {
						await db
							.update(conversations)
							.set({ messages: rawMessages, updatedAt: new Date() })
							.where(
								and(
									eq(conversations.id, conversationId),
									eq(conversations.userId, ctx.user.id),
								),
							)
							.catch((err) => {
								console.error("[chat] Failed to persist approval cleanup:", err);
							});
					}

					const messages = sanitizeMessages(rawMessages);

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

					const creditMiddleware = createCreditMiddleware({
						customerId: ctx.user.id,
						modelId: aiModel,
					});

					const approvalSigner = createApprovalSignerMiddleware({
						userId: ctx.user.id,
						conversationId: String(conversationId ?? ""),
						repoId: resolvedRepoId,
					});

					// TanStack AI's default ConsoleLogger uses console.dir(depth:null), which
					// dumps entire HTTP response objects on errors. Swap in one that extracts
					// the message string.
					const stream = chat({
						adapter: openRouterText(aiModel as Parameters<typeof openRouterText>[0]),
						messages,
						tools: [...tools, webSearchTool({ maxResults: 3 })],
						systemPrompts: [systemPrompt],
						conversationId,
						agentLoopStrategy: maxIterations(10),
						middleware: [approvalSigner, creditMiddleware],
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
										const err = meta.error as ProviderError;
										const raw = err?.error?.metadata?.raw ?? err?.error?.message ?? err?.message ?? "Unknown";
										console.error(msg, typeof raw === "string" ? raw : JSON.stringify(raw));
									} else {
										console.error(msg, meta ?? "");
									}
								},
							},
						},
					});

					return toServerSentEventsResponse(stream);
				} catch (error: any) {
					const errMsg = error?.error?.message || error?.message || "Unknown error";
					const provider = error?.error?.metadata?.provider_name;
					const raw = error?.error?.metadata?.raw;
					console.error(
						`[Chat API] ${provider ? provider + ": " : ""}${errMsg}`,
						raw ? `\n${raw}` : "",
					);
					getRequestLog()?.set({
						ai: { outcome: "error", provider, errorMessage: errMsg },
					});
					getRequestLog()?.error(
						error instanceof Error ? error : new Error(errMsg),
					);
					return jsonError(500, { error: errMsg });
				}
			},
		},
	},
});
