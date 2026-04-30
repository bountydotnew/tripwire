import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authedProcedure } from "../init";
import { db } from "#/db";
import { whitelistEntries, blacklistEntries, repositories, organizations } from "#/db/schema";
import { logEvent } from "#/lib/events";
import { getInstallationToken, getRepoContributors } from "#/lib/github/github-api";

import type { TRPCRouterRecord } from "@trpc/server";

// Validate GitHub user exists and get their info
async function validateGitHubUser(username: string): Promise<{
	id: number;
	login: string;
	avatar_url: string;
}> {
	const res = await fetch(`https://api.github.com/users/${username}`, {
		headers: {
			Accept: "application/vnd.github.v3+json",
			"User-Agent": "Tripwire",
		},
	});

	if (res.status === 404) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: `GitHub user "${username}" not found`,
		});
	}

	if (!res.ok) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to validate GitHub user",
		});
	}

	return res.json();
}

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
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const ghUser = await validateGitHubUser(input.githubUsername);

			// Check if user is on the blacklist
			const [blacklisted] = await db
				.select()
				.from(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, input.repoId),
						eq(blacklistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (blacklisted) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `@${ghUser.login} is on the blacklist. Remove them from the blacklist first.`,
				});
			}

			// Check if already whitelisted
			const [existing] = await db
				.select()
				.from(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, input.repoId),
						eq(whitelistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `@${ghUser.login} is already on the whitelist.`,
				});
			}

			const [entry] = await db
				.insert(whitelistEntries)
				.values({
					repoId: input.repoId,
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					addedById: ctx.user?.id,
				})
				.returning();

			await logEvent({
				repoId: input.repoId,
				action: "whitelist_added",
				severity: "info",
				description: `@${ghUser.login} was added to the whitelist`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: ctx.user?.name ?? ctx.user?.id },
			});

			return entry;
		}),

	remove: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await db
				.delete(whitelistEntries)
				.where(
					and(
						eq(whitelistEntries.repoId, input.repoId),
						eq(whitelistEntries.githubUsername, input.githubUsername),
					),
				);

			await logEvent({
				repoId: input.repoId,
				action: "whitelist_removed",
				severity: "info",
				description: `@${input.githubUsername} was removed from the whitelist`,
				targetGithubUsername: input.githubUsername,
				metadata: { removedBy: ctx.user?.name ?? ctx.user?.id },
			});

			return { success: true };
		}),

	suggestedContributors: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
			// Look up repo → org → installation token
			const [repo] = await db.select({ orgId: repositories.orgId, fullName: repositories.fullName }).from(repositories).where(eq(repositories.id, input.repoId)).limit(1);
			if (!repo) return [];

			const [org] = await db.select({ installationId: organizations.githubInstallationId }).from(organizations).where(eq(organizations.id, repo.orgId)).limit(1);
			if (!org) return [];

			let token: string;
			try {
				token = await getInstallationToken(org.installationId);
			} catch {
				return [];
			}

			// Get contributors from GitHub
			const contributors = await getRepoContributors(token, repo.fullName);
			if (contributors.length === 0) return [];

			// Get existing whitelist
			const existing = await db.select({ username: whitelistEntries.githubUsername }).from(whitelistEntries).where(eq(whitelistEntries.repoId, input.repoId));
			const whitelisted = new Set(existing.map((e) => e.username.toLowerCase()));

			// Filter out already whitelisted
			return contributors
				.filter((c) => !whitelisted.has(c.login.toLowerCase()))
				.map((c) => ({ username: c.login, avatarUrl: c.avatarUrl, contributions: c.contributions }));
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
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const ghUser = await validateGitHubUser(input.githubUsername);

			// Check if already blacklisted
			const [existing] = await db
				.select()
				.from(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, input.repoId),
						eq(blacklistEntries.githubUsername, ghUser.login),
					),
				)
				.limit(1);

			if (existing) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `@${ghUser.login} is already on the blacklist.`,
				});
			}

			const [entry] = await db
				.insert(blacklistEntries)
				.values({
					repoId: input.repoId,
					githubUsername: ghUser.login,
					githubUserId: ghUser.id,
					avatarUrl: ghUser.avatar_url,
					addedById: ctx.user?.id,
				})
				.returning();

			await logEvent({
				repoId: input.repoId,
				action: "blacklist_added",
				severity: "warning",
				description: `@${ghUser.login} was added to the blacklist`,
				targetGithubUsername: ghUser.login,
				targetGithubUserId: ghUser.id,
				metadata: { addedBy: ctx.user?.name ?? ctx.user?.id },
			});

			return entry;
		}),

	remove: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				githubUsername: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await db
				.delete(blacklistEntries)
				.where(
					and(
						eq(blacklistEntries.repoId, input.repoId),
						eq(blacklistEntries.githubUsername, input.githubUsername),
					),
				);

			await logEvent({
				repoId: input.repoId,
				action: "blacklist_removed",
				severity: "info",
				description: `@${input.githubUsername} was removed from the blacklist`,
				targetGithubUsername: input.githubUsername,
				metadata: { removedBy: ctx.user?.name ?? ctx.user?.id },
			});

			return { success: true };
		}),
} satisfies TRPCRouterRecord;
