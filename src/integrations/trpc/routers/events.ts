import { z } from "zod";
import { eq, desc, sql, and, gte } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "#/db";
import { events } from "#/db/schema";

import type { TRPCRouterRecord } from "@trpc/server";

export const eventsRouter = {
	/** List recent events for a repo */
	list: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
			}),
		)
		.query(async ({ input }) => {
			return db
				.select()
				.from(events)
				.where(eq(events.repoId, input.repoId))
				.orderBy(desc(events.createdAt))
				.limit(input.limit)
				.offset(input.offset);
		}),

	/** Aggregated stats for the Insights page */
	stats: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			const rows = await db
				.select({
					action: events.action,
					count: sql<number>`count(*)::int`,
				})
				.from(events)
				.where(
					and(
						eq(events.repoId, input.repoId),
						gte(events.createdAt, thirtyDaysAgo),
					),
				)
				.groupBy(events.action);

			const counts: Record<string, number> = {};
			for (const row of rows) {
				counts[row.action] = row.count;
			}

			return {
				prsClosed: counts["pr_closed"] ?? 0,
				issuesDeleted: counts["issue_deleted"] ?? 0,
				commentsDeleted: counts["comment_deleted"] ?? 0,
				botsBlacklisted: counts["bot_blacklisted"] ?? 0,
				usersBanned: counts["user_blocked"] ?? 0,
				totalBlocked:
					(counts["pr_closed"] ?? 0) +
					(counts["issue_deleted"] ?? 0) +
					(counts["comment_deleted"] ?? 0),
			};
		}),

	/** Weekly event counts for trend charts */
	trends: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				months: z.number().int().min(1).max(12).default(8),
			}),
		)
		.query(async ({ input }) => {
			const startDate = new Date();
			startDate.setMonth(startDate.getMonth() - input.months);

			const rows = await db
				.select({
					month: sql<string>`to_char(${events.createdAt}, 'Mon')`,
					monthNum: sql<number>`extract(month from ${events.createdAt})::int`,
					year: sql<number>`extract(year from ${events.createdAt})::int`,
					action: events.action,
					count: sql<number>`count(*)::int`,
				})
				.from(events)
				.where(
					and(
						eq(events.repoId, input.repoId),
						gte(events.createdAt, startDate),
					),
				)
				.groupBy(
					sql`to_char(${events.createdAt}, 'Mon')`,
					sql`extract(month from ${events.createdAt})`,
					sql`extract(year from ${events.createdAt})`,
					events.action,
				)
				.orderBy(
					sql`extract(year from ${events.createdAt})`,
					sql`extract(month from ${events.createdAt})`,
				);

			return rows;
		}),
} satisfies TRPCRouterRecord;
