import { z } from "zod";
import { eq, and, desc, sql } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "#/db";
import { conversations } from "#/db/schema";
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
			// Upsert: create if missing (race with create mutation), update if exists
			await db
				.insert(conversations)
				.values({
					id: input.chatId,
					userId: ctx.user.id,
					messages: input.messages,
					title: input.title ?? "New chat",
				})
				.onConflictDoUpdate({
					target: conversations.id,
					set: {
						messages: input.messages,
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
