import { z } from "zod";
import { desc, eq, sql } from "drizzle-orm";
import { authedProcedure, publicProcedure } from "../init";
import { db } from "@tripwire/db/client";
import { globalVouches } from "@tripwire/db";

import type { TRPCRouterRecord } from "@trpc/server";

export const vouchesRouter = {
	/**
	 * Public: list globally vouched users with their vouch counts.
	 * Accessible without auth for the public vouched-users directory.
	 */
	list: publicProcedure
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
				search: z.string().optional(),
			}),
		)
		.query(async ({ input }) => {
			const conditions = [];
			if (input.search) {
				conditions.push(
					sql`lower(${globalVouches.githubUsername}) like ${`%${input.search.toLowerCase()}%`}`,
				);
			}

			const whereClause = conditions.length > 0
				? sql`${sql.join(conditions, sql` and `)}`
				: undefined;

			// Aggregate by user to get vouch counts
			const rows = await db
				.select({
					githubUsername: globalVouches.githubUsername,
					githubUserId: globalVouches.githubUserId,
					avatarUrl: globalVouches.avatarUrl,
					vouchCount: sql<number>`count(*)::int`,
					firstVouchedAt: sql<string>`min(${globalVouches.createdAt})`,
					lastVouchedAt: sql<string>`max(${globalVouches.createdAt})`,
				})
				.from(globalVouches)
				.where(whereClause)
				.groupBy(
					globalVouches.githubUsername,
					globalVouches.githubUserId,
					globalVouches.avatarUrl,
				)
				.orderBy(desc(sql`count(*)`))
				.limit(input.limit)
				.offset(input.offset);

			const [countResult] = await db
				.select({ count: sql<number>`count(distinct lower(${globalVouches.githubUsername}))::int` })
				.from(globalVouches)
				.where(whereClause);

			return {
				users: rows,
				total: countResult?.count ?? 0,
			};
		}),

	/** Public: check if a specific user is globally vouched */
	check: publicProcedure
		.input(z.object({ username: z.string().min(1) }))
		.query(async ({ input }) => {
			const rows = await db
				.select({
					vouchedByName: globalVouches.vouchedByName,
					reason: globalVouches.reason,
					createdAt: globalVouches.createdAt,
				})
				.from(globalVouches)
				.where(
					sql`lower(${globalVouches.githubUsername}) = ${input.username.toLowerCase()}`,
				)
				.orderBy(desc(globalVouches.createdAt));

			return {
				isVouched: rows.length > 0,
				vouchCount: rows.length,
				vouches: rows,
			};
		}),

	/** Authed: vouch for a GitHub user (creates a global vouch record) */
	add: authedProcedure
		.input(
			z.object({
				githubUsername: z.string().min(1),
				githubUserId: z.number().int().optional(),
				avatarUrl: z.string().optional(),
				reason: z.string().max(500).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const [entry] = await db
				.insert(globalVouches)
				.values({
					githubUsername: input.githubUsername,
					githubUserId: input.githubUserId ?? null,
					avatarUrl: input.avatarUrl ?? null,
					vouchedById: ctx.user.id,
					vouchedByName: ctx.user.name ?? ctx.user.email ?? null,
					reason: input.reason ?? null,
				})
				.onConflictDoNothing()
				.returning();

			return { created: !!entry, id: entry?.id };
		}),

	/** Authed: revoke your vouch for a user */
	remove: authedProcedure
		.input(z.object({ githubUsername: z.string().min(1) }))
		.mutation(async ({ input, ctx }) => {
			const deleted = await db
				.delete(globalVouches)
				.where(
					sql`lower(${globalVouches.githubUsername}) = ${input.githubUsername.toLowerCase()} and ${globalVouches.vouchedById} = ${ctx.user.id}`,
				)
				.returning();

			return { removed: deleted.length > 0 };
		}),
} satisfies TRPCRouterRecord;
