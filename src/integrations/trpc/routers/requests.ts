import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authedProcedure, publicProcedure } from "../init";
import { db } from "#/db";
import {
	account,
	blacklistEntries,
	contributorRequests,
	repositories,
	whitelistEntries,
	type RequestKind,
} from "#/db/schema";
import { logEvent } from "#/lib/events";

import type { TRPCRouterRecord } from "@trpc/server";

const kindEnum = z.enum(["unblock", "access"]);

async function resolveSessionGithubUser(userId: string): Promise<{
	id: number;
	login: string;
	avatar_url: string;
}> {
	const [gh] = await db
		.select({ accessToken: account.accessToken, accountId: account.accountId })
		.from(account)
		.where(and(eq(account.userId, userId), eq(account.providerId, "github")))
		.limit(1);

	if (!gh?.accessToken) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Sign in with GitHub to submit a request.",
		});
	}

	const res = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${gh.accessToken}`,
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "Tripwire",
		},
	});

	if (!res.ok) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Could not verify your GitHub identity.",
		});
	}

	return res.json();
}

export const requestsRouter = {
	whoami: publicProcedure.query(async ({ ctx }) => {
		if (!ctx.user) return null;
		try {
			const gh = await resolveSessionGithubUser(ctx.user.id);
			return { githubLogin: gh.login, avatarUrl: gh.avatar_url };
		} catch {
			return null;
		}
	}),

	submit: publicProcedure
		.input(
			z.object({
				repoFullName: z.string().min(3),
				kind: kindEnum,
				reason: z.string().min(10).max(2000),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (!ctx.user) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Sign in to submit a request.",
				});
			}

			const [repo] = await db
				.select()
				.from(repositories)
				.where(eq(repositories.fullName, input.repoFullName))
				.limit(1);
			if (!repo) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
			}

			const ghUser = await resolveSessionGithubUser(ctx.user.id);

			const [existing] = await db
				.select()
				.from(contributorRequests)
				.where(
					and(
						eq(contributorRequests.repoId, repo.id),
						eq(contributorRequests.githubUsername, ghUser.login),
						eq(contributorRequests.kind, input.kind),
						eq(contributorRequests.status, "pending"),
					),
				)
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message:
						input.kind === "unblock"
							? "You already have a pending appeal for this repository."
							: "You already have a pending access request for this repository.",
				});
			}

			const [entry] = await db
				.insert(contributorRequests)
				.values({
					repoId: repo.id,
					kind: input.kind,
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					reason: input.reason,
				})
				.returning();

			await logEvent({
				repoId: repo.id,
				action: "request_submitted",
				severity: "info",
				description: `@${ghUser.login} submitted a ${input.kind} request`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { requestId: entry.id, kind: input.kind, reason: input.reason },
			});

			return { id: entry.id };
		}),

	list: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				status: z.enum(["pending", "approved", "denied"]).optional(),
			}),
		)
		.query(async ({ input }) => {
			const conds = [eq(contributorRequests.repoId, input.repoId)];
			if (input.status) conds.push(eq(contributorRequests.status, input.status));
			return db
				.select()
				.from(contributorRequests)
				.where(conds.length > 1 ? and(...conds) : conds[0])
				.orderBy(desc(contributorRequests.createdAt));
		}),

	decide: authedProcedure
		.input(
			z.object({
				requestId: z.string().uuid(),
				decision: z.enum(["approve", "deny"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const [req] = await db
				.select()
				.from(contributorRequests)
				.where(eq(contributorRequests.id, input.requestId))
				.limit(1);
			if (!req) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Request not found." });
			}
			if (req.status !== "pending") {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Request has already been ${req.status}.`,
				});
			}

			const nextStatus = input.decision === "approve" ? "approved" : "denied";

			if (input.decision === "approve") {
				await applyApproval(req.repoId, req.kind, {
					githubUsername: req.githubUsername,
					githubUserId: req.githubUserId,
					avatarUrl: req.avatarUrl,
					addedById: ctx.user.id,
				});
			}

			await db
				.update(contributorRequests)
				.set({ status: nextStatus, decidedById: ctx.user.id, decidedAt: new Date() })
				.where(eq(contributorRequests.id, req.id));

			await logEvent({
				repoId: req.repoId,
				action: "request_decided",
				severity: input.decision === "approve" ? "success" : "info",
				description: `@${req.githubUsername}'s ${req.kind} request was ${nextStatus}`,
				targetGithubUsername: req.githubUsername,
				targetGithubUserId: req.githubUserId ?? undefined,
				metadata: {
					requestId: req.id,
					decision: nextStatus,
					decidedBy: ctx.user.name ?? ctx.user.id,
				},
			});

			return { status: nextStatus };
		}),
} satisfies TRPCRouterRecord;

async function applyApproval(
	repoId: string,
	kind: RequestKind,
	gh: {
		githubUsername: string;
		githubUserId: number | null;
		avatarUrl: string | null;
		addedById: string;
	},
) {
	if (kind === "unblock") {
		await db
			.delete(blacklistEntries)
			.where(
				and(
					eq(blacklistEntries.repoId, repoId),
					eq(blacklistEntries.githubUsername, gh.githubUsername),
				),
			);
		return;
	}

	const [existing] = await db
		.select()
		.from(whitelistEntries)
		.where(
			and(
				eq(whitelistEntries.repoId, repoId),
				eq(whitelistEntries.githubUsername, gh.githubUsername),
			),
		)
		.limit(1);
	if (existing) return;

	await db.insert(whitelistEntries).values({
		repoId,
		githubUsername: gh.githubUsername,
		githubUserId: gh.githubUserId ?? undefined,
		avatarUrl: gh.avatarUrl ?? undefined,
		addedById: gh.addedById,
	});
}
