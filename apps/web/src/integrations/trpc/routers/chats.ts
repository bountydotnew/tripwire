import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "@tripwire/db/client";
import { conversations } from "@tripwire/db";
import type { TRPCRouterRecord } from "@trpc/server";
import { mergeMessagesPreservingResults } from "#/lib/chat-persistence";

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
				repoId: z.string().uuid().optional(),
				messages: z.array(z.any()),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Merge with whatever's in DB so server-side tool outputs survive a
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

			const merged = mergeMessagesPreservingResults(
				input.messages,
				existing?.messages ?? [],
			);

			await db
				.insert(conversations)
				.values({
					id: input.chatId,
					userId: ctx.user.id,
					repoId: input.repoId ?? null,
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
