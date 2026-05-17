import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { authedProcedure } from "../init";
import { assertRepoOwner, computeContributorScore } from "@tripwire/core";
import { resetContributorScore } from "@tripwire/core";
import { fetchUserContributions } from "@tripwire/github";
import { db } from "@tripwire/db/client";
import {
	repositories,
	organizations,
	events,
	githubReputation,
	whitelistEntries,
	blacklistEntries,
} from "@tripwire/db";
import {
	getInstallationToken,
	getUser,
	getMergedPrCount,
	getClosedPrCount,
	getPublicNonForkRepoCount,
	getPublicForkRepoCount,
	getContextRepoPrCount,
	hasProfileReadme,
	fetchUserGraphQL,
	fetchUserAchievements,
} from "@tripwire/github";

import type { TRPCRouterRecord } from "@trpc/server";

async function getTokenForRepo(repoId: string): Promise<string | null> {
	try {
		const [repo] = await db
			.select({ orgId: repositories.orgId })
			.from(repositories)
			.where(eq(repositories.id, repoId))
			.limit(1);
		if (!repo) return null;
		const [org] = await db
			.select({ installationId: organizations.githubInstallationId })
			.from(organizations)
			.where(eq(organizations.id, repo.orgId))
			.limit(1);
		if (!org) return null;
		return getInstallationToken(org.installationId);
	} catch {
		return null;
	}
}

export const reputationRouter = {
	/**
	 * Compute the contributor trust score for a GitHub user against a repo.
	 */
	getScore: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				username: z.string().min(1),
			}),
		)
		.query(async ({ ctx, input }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			const token = await getTokenForRepo(input.repoId);
			if (!token) return null;

			const [repoRow] = await db
				.select({ fullName: repositories.fullName })
				.from(repositories)
				.where(eq(repositories.id, input.repoId))
				.limit(1);
			const contextRepoFullName = repoRow?.fullName ?? "";

			const username = input.username;

			const [
				ghUser,
				whitelist,
				blacklist,
				allEvents,
				reputationRow,
				mergedPrs,
				closedPrs,
				publicNonForkRepos,
				publicForkRepos,
				prsToThisRepo,
				profileReadme,
				graphqlData,
				achievements,
			] = await Promise.all([
				getUser(token, username).catch(() => null),
				db
					.select()
					.from(whitelistEntries)
					.where(
						and(
							eq(whitelistEntries.repoId, input.repoId),
							sql`lower(${whitelistEntries.githubUsername}) = ${username.toLowerCase()}`,
						),
					)
					.limit(1),
				db
					.select()
					.from(blacklistEntries)
					.where(
						and(
							eq(blacklistEntries.repoId, input.repoId),
							sql`lower(${blacklistEntries.githubUsername}) = ${username.toLowerCase()}`,
						),
					)
					.limit(1),
				db
					.select()
					.from(events)
					.where(
						and(
							eq(events.repoId, input.repoId),
							sql`lower(${events.targetGithubUsername}) = ${username.toLowerCase()}`,
						),
					),
				db
					.select({ scoreResetAt: githubReputation.scoreResetAt })
					.from(githubReputation)
					.where(
						and(
							eq(githubReputation.repoId, input.repoId),
							sql`lower(${githubReputation.githubUsername}) = ${username.toLowerCase()}`,
						),
					)
					.limit(1),
				getMergedPrCount(token, username).catch(() => 0),
				getClosedPrCount(token, username).catch(() => 0),
				getPublicNonForkRepoCount(token, username).catch(() => 0),
				getPublicForkRepoCount(token, username).catch(() => 0),
				contextRepoFullName
					? getContextRepoPrCount(token, username, contextRepoFullName).catch(() => 0)
					: Promise.resolve(0),
				hasProfileReadme(token, username).catch(() => false),
				fetchUserGraphQL(token, username).catch(() => null),
				fetchUserAchievements(username).catch(() => []),
			]);

			if (!ghUser) return null;

			const scoreResetAt = reputationRow[0]?.scoreResetAt ?? null;
			const countsAfterReset = scoreResetAt
				? allEvents.filter((e) => e.createdAt > scoreResetAt)
				: allEvents;

			const closedUnmergedPrs = Math.max(0, closedPrs - mergedPrs);
			const blockedCount = countsAfterReset.filter((e) => e.action === "pipeline_blocked").length;
			const allowedCount = countsAfterReset.filter((e) => e.action === "pipeline_allowed").length;
			const nearMissCount = countsAfterReset.filter((e) => e.action === "rule_near_miss").length;
			const createdAt = (ghUser as Record<string, unknown>).created_at
				? new Date((ghUser as Record<string, unknown>).created_at as string)
				: new Date();
			const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86400000);

			const status: "normal" | "blacklisted" | "whitelisted" =
				blacklist.length > 0 ? "blacklisted" : whitelist.length > 0 ? "whitelisted" : "normal";

			const score = computeContributorScore({
				accountAgeDays,
				followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
				following: (ghUser as Record<string, unknown>).following as number ?? 0,
				publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
				publicNonForkRepoCount: publicNonForkRepos,
				publicForkRepoCount: publicForkRepos,
				contextRepoPrCount: prsToThisRepo,
				publicGists: (ghUser as Record<string, unknown>).public_gists as number ?? 0,
				bio: (ghUser as Record<string, unknown>).bio as string ?? null,
				company: (ghUser as Record<string, unknown>).company as string ?? null,
				location: (ghUser as Record<string, unknown>).location as string ?? null,
				blog: (ghUser as Record<string, unknown>).blog as string ?? null,
				twitterUsername: (ghUser as Record<string, unknown>).twitter_username as string ?? null,
				hasTwoFactor: (ghUser as Record<string, unknown>).two_factor_authentication as boolean ?? false,
				hasProfileReadme: profileReadme,
				graphql: graphqlData,
				achievements,
				mergedPrCount: mergedPrs,
				closedPrCount: closedPrs,
				closedUnmergedPrCount: closedUnmergedPrs,
				blockedCount,
				allowedCount,
				nearMissCount,
			});

			return { score, status };
		}),

	/**
	 * Reset a contributor's Tripwire score history for a repo.
	 *
	 * Zeros their reputation totals and stamps a scoreResetAt so future
	 * score_breakdown / lookup_user calls ignore older events. The events
	 * themselves remain in the audit feed.
	 */
	reset: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				username: z.string().min(1),
				githubUserId: z.number().int().optional(),
				reason: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			return resetContributorScore({
				repoId: input.repoId,
				userId: ctx.user.id,
				username: input.username,
				githubUserId: input.githubUserId,
				reason: input.reason,
			});
		}),

	/** Fetch GitHub contributions heatmap + pinned repos for a user */
	getProfile: authedProcedure
		.input(z.object({
			repoId: z.string().uuid(),
			username: z.string().min(1),
		}))
		.query(async ({ input }) => {
			const token = await getTokenForRepo(input.repoId);
			if (!token) return null;

			const [contribs, graphql, achievements] = await Promise.all([
				fetchUserContributions(token, input.username).catch(() => null),
				fetchUserGraphQL(token, input.username).catch(() => null),
				fetchUserAchievements(input.username).catch(() => []),
			]);

			return {
				contributions: contribs?.contributions ?? null,
				pinned: contribs?.pinned ?? [],
				graphql,
				achievements,
			};
		}),
} satisfies TRPCRouterRecord;
