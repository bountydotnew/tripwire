import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "@tripwire/db/client";
import { workflows, repositories, organizations, events } from "@tripwire/db";
import { fetchPublicUser, fetchPublicRepos } from "@tripwire/github/public";
import {
	getInstallationToken,
	getUser,
	getMergedPrCount,
	getClosedPrCount,
	getPublicNonForkRepoCount,
	getPublicForkRepoCount,
	hasProfileReadme,
	fetchUserGraphQL,
	fetchUserAchievements,
} from "@tripwire/github";
import { computeContributorScore } from "@tripwire/core";

import type { TRPCRouterRecord } from "@trpc/server";

/** Verify user owns the repo (through the org chain) */
async function assertRepoAccess(userId: string, repoId: string) {
	const [repo] = await db
		.select()
		.from(repositories)
		.innerJoin(organizations, eq(repositories.orgId, organizations.id))
		.where(and(eq(repositories.id, repoId), eq(organizations.ownerId, userId)))
		.limit(1);
	if (!repo) throw new Error("Repo not found or access denied");
	return repo;
}

const workflowDefinitionSchema = z.object({
	nodes: z.array(z.any()),
	edges: z.array(z.any()),
});

export const workflowsRouter = {
	list: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			await assertRepoAccess(ctx.user.id, input.repoId);
			return db
				.select()
				.from(workflows)
				.where(eq(workflows.repoId, input.repoId))
				.orderBy(desc(workflows.updatedAt));
		}),

	get: authedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.query(async ({ ctx, input }) => {
			const [wf] = await db.select().from(workflows).where(eq(workflows.id, input.id)).limit(1);
			if (!wf) throw new Error("Workflow not found");
			await assertRepoAccess(ctx.user.id, wf.repoId);
			return wf;
		}),

	create: authedProcedure
		.input(z.object({
			repoId: z.string().uuid(),
			name: z.string().min(1).max(100),
			description: z.string().max(500).optional(),
			definition: workflowDefinitionSchema,
		}))
		.mutation(async ({ ctx, input }) => {
			await assertRepoAccess(ctx.user.id, input.repoId);
			const [wf] = await db
				.insert(workflows)
				.values({
					repoId: input.repoId,
					name: input.name,
					description: input.description,
					definition: input.definition,
				})
				.returning();
			return wf;
		}),

	update: authedProcedure
		.input(z.object({
			id: z.string().uuid(),
			name: z.string().min(1).max(100).optional(),
			description: z.string().max(500).nullish(),
			definition: workflowDefinitionSchema.optional(),
			enabled: z.boolean().optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			const [existing] = await db.select().from(workflows).where(eq(workflows.id, input.id)).limit(1);
			if (!existing) throw new Error("Workflow not found");
			await assertRepoAccess(ctx.user.id, existing.repoId);

			const [wf] = await db
				.update(workflows)
				.set({
					...(input.name !== undefined && { name: input.name }),
					...(input.description !== undefined && { description: input.description }),
					...(input.definition !== undefined && { definition: input.definition }),
					...(input.enabled !== undefined && { enabled: input.enabled }),
					updatedAt: new Date(),
				})
				.where(eq(workflows.id, input.id))
				.returning();
			return wf;
		}),

	delete: authedProcedure
		.input(z.object({ id: z.string().uuid() }))
		.mutation(async ({ ctx, input }) => {
			const [existing] = await db.select().from(workflows).where(eq(workflows.id, input.id)).limit(1);
			if (!existing) throw new Error("Workflow not found");
			await assertRepoAccess(ctx.user.id, existing.repoId);
			await db.delete(workflows).where(eq(workflows.id, input.id));
			return { ok: true };
		}),

	/** Fetch real GitHub user data for workflow simulation */
	simulate: authedProcedure
		.input(z.object({
			username: z.string().min(1),
			repoId: z.string().uuid().optional(),
		}))
		.mutation(async ({ input }) => {
			const username = input.username;

			// Try to get an installation token for richer data
			let token: string | null = null;
			let repoId: string | null = input.repoId ?? null;
			if (repoId) {
				try {
					const [repo] = await db
						.select({ orgId: repositories.orgId })
						.from(repositories)
						.where(eq(repositories.id, repoId))
						.limit(1);
					if (repo) {
						const [org] = await db
							.select({ installationId: organizations.githubInstallationId })
							.from(organizations)
							.where(eq(organizations.id, repo.orgId))
							.limit(1);
						if (org) token = await getInstallationToken(org.installationId);
					}
				} catch { /* fall back to public API */ }
			}

			// Fetch data — authenticated if possible, public fallback
			if (token) {
				const [
					ghUser,
					mergedPrs,
					closedPrs,
					publicNonForkRepos,
					publicForkRepos,
					profileReadme,
					graphqlData,
					achievements,
					repoEvents,
				] = await Promise.all([
					getUser(token, username).catch(() => null),
					getMergedPrCount(token, username).catch(() => 0),
					getClosedPrCount(token, username).catch(() => 0),
					getPublicNonForkRepoCount(token, username).catch(() => 0),
					getPublicForkRepoCount(token, username).catch(() => 0),
					hasProfileReadme(token, username).catch(() => false),
					fetchUserGraphQL(token, username).catch(() => null),
					fetchUserAchievements(username).catch(() => []),
					repoId
						? db.select().from(events).where(
							and(
								eq(events.repoId, repoId),
								sql`lower(${events.targetGithubUsername}) = ${username.toLowerCase()}`,
							),
						)
						: Promise.resolve([]),
				]);

				if (!ghUser) return { found: false as const };

				const createdAt = new Date((ghUser as Record<string, unknown>).created_at as string);
				const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
				const closedUnmergedPrs = Math.max(0, closedPrs - mergedPrs);
				const blockedCount = repoEvents.filter((e) => e.action === "pipeline_blocked").length;
				const allowedCount = repoEvents.filter((e) => e.action === "pipeline_allowed").length;
				const nearMissCount = repoEvents.filter((e) => e.action === "rule_near_miss").length;

				const score = computeContributorScore({
					accountAgeDays,
					followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
					following: (ghUser as Record<string, unknown>).following as number ?? 0,
					publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
					publicNonForkRepoCount: publicNonForkRepos,
					publicForkRepoCount: publicForkRepos,
					contextRepoPrCount: 0,
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

				return {
					found: true as const,
					user: {
						login: (ghUser as Record<string, unknown>).login as string,
						avatarUrl: (ghUser as Record<string, unknown>).avatar_url as string,
						name: (ghUser as Record<string, unknown>).name as string | null,
						bio: (ghUser as Record<string, unknown>).bio as string | null,
						createdAt: (ghUser as Record<string, unknown>).created_at as string,
					},
					data: {
						accountAgeDays,
						followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
						following: (ghUser as Record<string, unknown>).following as number ?? 0,
						publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
						publicNonForkRepos: publicNonForkRepos,
						publicGists: (ghUser as Record<string, unknown>).public_gists as number ?? 0,
						hasProfileReadme: profileReadme,
						mergedPrs,
						score: score.total,
					},
				};
			}

			// Public API fallback (no token)
			const [user, repos] = await Promise.all([
				fetchPublicUser(username),
				fetchPublicRepos(username),
			]);

			if (!user) return { found: false as const };

			const accountAgeDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / 86_400_000);
			const nonForkRepos = repos.filter((r) => !r.fork);

			const score = computeContributorScore({
				accountAgeDays,
				followers: user.followers,
				following: user.following,
				publicRepos: user.public_repos,
				publicNonForkRepoCount: nonForkRepos.length,
				publicForkRepoCount: repos.length - nonForkRepos.length,
				contextRepoPrCount: 0,
				publicGists: user.public_gists,
				bio: user.bio,
				company: user.company,
				location: user.location,
				blog: user.blog,
				twitterUsername: user.twitter_username,
				hasTwoFactor: false,
				hasProfileReadme: false,
				graphql: null,
				achievements: [],
				mergedPrCount: 0,
				closedPrCount: 0,
				closedUnmergedPrCount: 0,
				blockedCount: 0,
				allowedCount: 0,
				nearMissCount: 0,
			});

			return {
				found: true as const,
				user: {
					login: user.login,
					avatarUrl: user.avatar_url,
					name: user.name,
					bio: user.bio,
					createdAt: user.created_at,
				},
				data: {
					accountAgeDays,
					followers: user.followers,
					following: user.following,
					publicRepos: user.public_repos,
					publicNonForkRepos: nonForkRepos.length,
					publicGists: user.public_gists,
					hasProfileReadme: false,
					mergedPrs: 0,
					score: score.total,
				},
			};
		}),
} satisfies TRPCRouterRecord;
