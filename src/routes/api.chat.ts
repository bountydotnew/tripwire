import { createFileRoute } from "@tanstack/react-router";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { createTripwireTools } from "#/lib/ai/tools";
import { buildSystemPrompt } from "#/lib/ai/prompt";
import { createContext } from "#/integrations/trpc/init";
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
					const { messages: rawMessages, repoId, conversationId } = await request.json();

					// Filter corrupted messages from TanStack AI batch approval bug
					// TODO: Remove when TanStack AI fixes tool approval state management
					const messages = rawMessages
						.map((msg: any) => {
							if (!msg.parts) return msg;
							// Filter out tool-call parts with missing name (corrupted state)
							const cleanParts = msg.parts.filter((part: any) => {
								if (part.type === "tool-call" && !part.name) return false;
								return true;
							});
							return { ...msg, parts: cleanParts };
						})
						.filter((msg: any) => {
							// Filter out empty messages
							if (msg.parts && msg.parts.length === 0) return false;
							return true;
						});

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
					});

					// Create tools with context
					const tools = createTripwireTools({
						userId: ctx.user.id,
						userName: ctx.user.name ?? ctx.user.email ?? "User",
						repoId: resolvedRepoId,
					});

					// Create streaming chat response
					const stream = chat({
						adapter: openRouterText("openai/gpt-4o-mini"),
						messages,
						tools,
						systemPrompts: [systemPrompt],
						conversationId,
					});

					return toServerSentEventsResponse(stream);
				} catch (error) {
					console.error("Chat API error:", error);
					return new Response(
						JSON.stringify({
							error: error instanceof Error ? error.message : "An error occurred",
						}),
						{ status: 500, headers: { "Content-Type": "application/json" } },
					);
				}
			},
		},
	},
});
