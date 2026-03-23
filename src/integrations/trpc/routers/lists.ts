import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "#/db";
import { whitelistEntries, blacklistEntries } from "#/db/schema";

import type { TRPCRouterRecord } from "@trpc/server";

export const whitelistRouter = {
	list: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
			return db
				.select()
				.from(whitelistEntries)
				.where(eq(whitelistEntries.repoId, input.repoId));
		}),

	add: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string().min(1),
				githubUserId: z.number().int().optional(),
				avatarUrl: z.string().url().optional(),
				addedById: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const [entry] = await db
				.insert(whitelistEntries)
				.values(input)
				.returning();
			return entry;
		}),

	remove: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			await db
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, input.repoId),
						eq(whitelistEntries.githubUsername, input.githubUsername),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;

export const blacklistRouter = {
	list: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
			return db
				.select()
				.from(blacklistEntries)
				.where(eq(blacklistEntries.repoId, input.repoId));
		}),

	add: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string().min(1),
				githubUserId: z.number().int().optional(),
				avatarUrl: z.string().url().optional(),
				addedById: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			const [entry] = await db
				.insert(blacklistEntries)
				.values(input)
				.returning();
			return entry;
		}),

	remove: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string(),
			}),
		)
		.mutation(async ({ input }) => {
			await db
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, input.repoId),
						eq(blacklistEntries.githubUsername, input.githubUsername),
					),
				);
			return { success: true };
		}),
} satisfies TRPCRouterRecord;
