import { createFileRoute } from "@tanstack/react-router";
import { chat, toServerSentEventsResponse } from "@tanstack/ai";
import { openRouterText } from "@tanstack/ai-openrouter";
import { createTripwireTools } from "#/lib/ai/tools";
import { buildSystemPrompt } from "#/lib/ai/prompt";
import { createContext } from "#/integrations/trpc/init";
import { db } from "#/db";
import { repositories } from "#/db/schema";
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
					const { messages, repoId, conversationId } = await request.json();

					if (!repoId) {
						return new Response(
							JSON.stringify({ error: "repoId is required" }),
							{ status: 400, headers: { "Content-Type": "application/json" } },
						);
					}

					// Get repo info for context
					const [repo] = await db
						.select()
						.from(repositories)
						.where(eq(repositories.id, repoId))
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
						repoId,
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
