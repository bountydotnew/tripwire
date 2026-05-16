import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "@tripwire/db/client";
import { conversations } from "@tripwire/db";
import type { TRPCRouterRecord } from "@trpc/server";

export const chatsRouter = {
	create: authedProcedure
		.input(
			z.object({
				id: z.string().uuid(),
				repoId: z.string().uuid().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const [conv] = await db
				.insert(conversations)
				.values({
					id: input.id,
					userId: ctx.user.id,
					repoId: input.repoId ?? null,
				})
				.onConflictDoNothing()
				.returning();
			return conv ?? null;
		}),

	get: authedProcedure
		.input(z.object({ chatId: z.string().uuid() }))
		.query(async ({ input, ctx }) => {
			const [conv] = await db
				.select()
				.from(conversations)
				.where(
					and(
						eq(conversations.id, input.chatId),
						eq(conversations.userId, ctx.user.id),
					),
				)
				.limit(1);
			return conv ?? null;
		}),

	saveMessages: authedProcedure
		.input(
			z.object({
				chatId: z.string().uuid(),
				messages: z.array(z.any()),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Merge with whatever's in DB so server-side cleanups (e.g. error
			// tool-results pushed by /api/chat's executeApprovedTools) survive a
			// later save from the client that's still using its stale state.
			const [existing] = await db
				.select({ messages: conversations.messages })
				.from(conversations)
				.where(
					and(
						eq(conversations.id, input.chatId),
						eq(conversations.userId, ctx.user.id),
					),
				)
				.limit(1);

			const merged = existing
				? mergeMessagesPreservingResults(input.messages, existing.messages ?? [])
				: input.messages;

			await db
				.insert(conversations)
				.values({
					id: input.chatId,
					userId: ctx.user.id,
					messages: merged,
					title: input.title ?? "New chat",
				})
				.onConflictDoUpdate({
					target: conversations.id,
					set: {
						messages: merged,
						...(input.title ? { title: input.title } : {}),
						updatedAt: new Date(),
					},
					setWhere: eq(conversations.userId, ctx.user.id),
				});
		}),

	list: authedProcedure
		.input(
			z.object({
				limit: z.number().min(1).max(50).default(20),
			}),
		)
		.query(async ({ input, ctx }) => {
			return db
				.select({
					id: conversations.id,
					title: conversations.title,
					createdAt: conversations.createdAt,
					updatedAt: conversations.updatedAt,
				})
				.from(conversations)
				.where(eq(conversations.userId, ctx.user.id))
				.orderBy(desc(conversations.updatedAt))
				.limit(input.limit);
		}),

	delete: authedProcedure
		.input(z.object({ chatId: z.string().uuid() }))
		.mutation(async ({ input, ctx }) => {
			await db
				.delete(conversations)
				.where(
					and(
						eq(conversations.id, input.chatId),
						eq(conversations.userId, ctx.user.id),
					),
				);
		}),
} satisfies TRPCRouterRecord;


/**
 * When the client saves messages, it sends whatever its useChat state holds.
 * That state doesn't reflect server-side mutations performed in /api/chat
 * (e.g. error tool-results pushed by executeApprovedTools when it rejects a
 * stale approval). To prevent the client's save from silently clobbering
 * those, we merge: for every assistant message in the input, any tool-result
 * present in the DB for a toolCallId that the input's message is missing
 * gets preserved.
 *
 * Tradeoff: the client can never "delete" a tool-result by sending an
 * update without it. That's fine — tool-results in this app are append-only
 * audit records of what the server actually did.
 */
function mergeMessagesPreservingResults(
	input: unknown[],
	existing: unknown[],
): unknown[] {
	// Build a map: assistant-message-index → { resultId → result-part }
	const existingResults = new Map<number, Map<string, unknown>>();
	for (let i = 0; i < existing.length; i++) {
		const msg = existing[i] as { role?: string; parts?: unknown[] } | undefined;
		if (!msg || msg.role !== "assistant" || !Array.isArray(msg.parts)) continue;
		const map = new Map<string, unknown>();
		for (const part of msg.parts) {
			const p = part as { type?: string; toolCallId?: string; id?: string };
			if (p.type === "tool-result") {
				const id = p.toolCallId || p.id;
				if (id) map.set(id, part);
			}
		}
		if (map.size > 0) existingResults.set(i, map);
	}

	return input.map((msg, i) => {
		const m = msg as { role?: string; parts?: unknown[] } | undefined;
		if (!m || m.role !== "assistant" || !Array.isArray(m.parts)) return msg;
		const dbResults = existingResults.get(i);
		if (!dbResults) return msg;

		const inputResultIds = new Set<string>();
		for (const part of m.parts) {
			const p = part as { type?: string; toolCallId?: string; id?: string };
			if (p.type === "tool-result") {
				const id = p.toolCallId || p.id;
				if (id) inputResultIds.add(id);
			}
		}

		const missing: unknown[] = [];
		for (const [id, part] of dbResults) {
			if (!inputResultIds.has(id)) missing.push(part);
		}
		if (missing.length === 0) return msg;

		return { ...m, parts: [...m.parts, ...missing] };
	});
}
