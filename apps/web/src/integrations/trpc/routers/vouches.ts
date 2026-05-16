import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { adminProcedure, publicProcedure } from "../init";
import { trpcError } from "../error";
import { db } from "@tripwire/db/client";
import { globalVouches, vouchRequests, account } from "@tripwire/db";

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

	/** Admin: vouch for a GitHub user (creates a global vouch record) */
	add: adminProcedure
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

	/** Admin: revoke your vouch for a user */
	remove: adminProcedure
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


	/** Public: submit a request to be vouched (requires GitHub sign-in) */
	requestVouch: publicProcedure
		.input(z.object({ reason: z.string().min(10).max(2000) }))
		.mutation(async ({ input, ctx }) => {
			if (!ctx.user) {
				throw trpcError({
					code: "auth.signin_required",
					status: 401,
					message: "Sign in to request a vouch.",
					fix: "Click \"Sign in with GitHub\" and try again.",
				});
			}

			// Resolve GitHub identity
			const [gh] = await db
				.select({ accessToken: account.accessToken })
				.from(account)
				.where(and(eq(account.userId, ctx.user.id), eq(account.providerId, "github")))
				.limit(1);

			if (!gh?.accessToken) {
				throw trpcError({
					code: "auth.github_required",
					status: 401,
					message: "Link your GitHub account to request a vouch.",
				});
			}

			const ghRes = await fetch("https://api.github.com/user", {
				headers: {
					Authorization: `Bearer ${gh.accessToken}`,
					Accept: "application/vnd.github.v3+json",
					"User-Agent": "Tripwire",
				},
			});
			if (!ghRes.ok) {
				throw trpcError({
					code: "auth.github_verify_failed",
					status: 401,
					message: "Could not verify your GitHub identity. Try signing out and back in.",
				});
			}
			const ghUser = await ghRes.json() as { login: string; id: number; avatar_url: string };

			// Check for existing pending request
			const [existing] = await db
				.select()
				.from(vouchRequests)
				.where(
					and(
						sql`lower(${vouchRequests.githubUsername}) = ${ghUser.login.toLowerCase()}`,
						eq(vouchRequests.status, "pending"),
					),
				)
				.limit(1);

			if (existing) {
				throw trpcError({
					code: "vouches.pending_exists",
					status: 409,
					message: "You already have a pending vouch request.",
					fix: "Wait for an admin to review your existing request.",
				});
			}

			// Check if already vouched
			const [alreadyVouched] = await db
				.select()
				.from(globalVouches)
				.where(sql`lower(${globalVouches.githubUsername}) = ${ghUser.login.toLowerCase()}`)
				.limit(1);

			if (alreadyVouched) {
				throw trpcError({
					code: "vouches.already_vouched",
					status: 409,
					message: "You're already a vouched contributor.",
				});
			}

			const [entry] = await db
				.insert(vouchRequests)
				.values({
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					reason: input.reason,
				})
				.returning();

			return { id: entry.id };
		}),

	/** Admin: list pending vouch requests */
	listRequests: adminProcedure
		.input(
			z.object({
				status: z.enum(["pending", "approved", "denied"]).optional(),
			}).optional(),
		)
		.query(async ({ input }) => {
			const conds = [];
			if (input?.status) conds.push(eq(vouchRequests.status, input.status));
			return db
				.select()
				.from(vouchRequests)
				.where(conds.length > 0 ? and(...conds) : undefined)
				.orderBy(desc(vouchRequests.createdAt));
		}),

	/** Admin: approve or deny a vouch request */
	decideRequest: adminProcedure
		.input(z.object({
			requestId: z.string().uuid(),
			decision: z.enum(["approve", "deny"]),
		}))
		.mutation(async ({ input, ctx }) => {
			const [req] = await db
				.select()
				.from(vouchRequests)
				.where(eq(vouchRequests.id, input.requestId))
				.limit(1);

			if (!req || req.status !== "pending") {
				throw trpcError({
					code: "vouches.request_not_pending",
					status: 409,
					message: "This request has already been decided.",
				});
			}

			const nextStatus = input.decision === "approve" ? "approved" : "denied";

			await db
				.update(vouchRequests)
				.set({
					status: nextStatus,
					decidedById: ctx.user.id,
					decidedAt: new Date(),
				})
				.where(eq(vouchRequests.id, input.requestId));

			// If approved, create the global vouch
			if (input.decision === "approve") {
				await db
					.insert(globalVouches)
					.values({
						githubUsername: req.githubUsername,
						githubUserId: req.githubUserId,
						avatarUrl: req.avatarUrl,
						vouchedById: ctx.user.id,
						vouchedByName: ctx.user.name ?? ctx.user.email ?? null,
						reason: req.reason,
					})
					.onConflictDoNothing();
			}

			return { status: nextStatus };
		}),
} satisfies TRPCRouterRecord;
