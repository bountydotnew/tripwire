import { z } from "zod";
import { and, eq, desc, sql } from "drizzle-orm";
import { authedProcedure, adminProcedure } from "../init";
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
	githubApi,
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

	/** Run a user, PR, issue, or comment through all active workflows — returns per-workflow pass/fail */
	runReport: authedProcedure
		.input(z.object({
			repoId: z.string().uuid(),
			username: z.string().min(1),
			/** Optional: PR/issue number to check (fetches content text for content-based rules) */
			ref: z.string().optional(),
			/** What kind of content to check: user (default), pr, issue, comment */
			kind: z.enum(["user", "pr", "issue"]).optional(),
		}))
		.mutation(async ({ ctx, input }) => {
			await assertRepoAccess(ctx.user.id, input.repoId);

			// 1. Fetch all active workflows for this repo
			const activeWorkflows = await db
				.select()
				.from(workflows)
				.where(and(eq(workflows.repoId, input.repoId), eq(workflows.enabled, true)))
				.orderBy(desc(workflows.updatedAt));

			if (activeWorkflows.length === 0) {
				return { username: input.username, results: [], userData: null, message: "No active workflows" };
			}

			// 2. Fetch user data (reuse simulate logic)
			let token: string | null = null;
			try {
				const [repo] = await db
					.select({ orgId: repositories.orgId })
					.from(repositories)
					.where(eq(repositories.id, input.repoId))
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

			let userData: {
				user: { login: string; avatarUrl: string; name: string | null };
				data: Record<string, unknown>;
			} | null = null;

			if (token) {
				const [ghUser, mergedPrs, publicNonForkRepos, profileReadme, graphqlData, achievements, repoEvents] = await Promise.all([
					getUser(token, input.username).catch(() => null),
					getMergedPrCount(token, input.username).catch(() => 0),
					getPublicNonForkRepoCount(token, input.username).catch(() => 0),
					hasProfileReadme(token, input.username).catch(() => false),
					fetchUserGraphQL(token, input.username).catch(() => null),
					fetchUserAchievements(input.username).catch(() => []),
					db.select().from(events).where(
						and(eq(events.repoId, input.repoId), sql`lower(${events.targetGithubUsername}) = ${input.username.toLowerCase()}`),
					),
				]);

				if (ghUser) {
					const createdAt = new Date((ghUser as Record<string, unknown>).created_at as string);
					const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);
					const blockedCount = repoEvents.filter((e) => e.action === "pipeline_blocked").length;
					const allowedCount = repoEvents.filter((e) => e.action === "pipeline_allowed").length;

					const score = computeContributorScore({
						accountAgeDays,
						followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
						following: (ghUser as Record<string, unknown>).following as number ?? 0,
						publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
						publicNonForkRepoCount: publicNonForkRepos,
						publicForkRepoCount: 0,
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
						closedPrCount: 0,
						closedUnmergedPrCount: 0,
						blockedCount,
						allowedCount,
						nearMissCount: 0,
					});

					userData = {
						user: {
							login: (ghUser as Record<string, unknown>).login as string,
							avatarUrl: (ghUser as Record<string, unknown>).avatar_url as string,
							name: (ghUser as Record<string, unknown>).name as string | null,
						},
						data: {
							accountAgeDays,
							followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
							publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
							publicNonForkRepos: publicNonForkRepos,
							hasProfileReadme: profileReadme,
							mergedPrs,
							score: score.total,
						},
					};
				}
			}

			// 2b. Fetch PR/issue content if a ref was provided
			let contentText: string | null = null;
			let contentMeta: { title: string; number: number; url: string; state: string } | null = null;

			if (token && input.ref && input.kind && input.kind !== "user") {
				try {
					const [repoRow] = await db
						.select({ fullName: repositories.fullName })
						.from(repositories)
						.where(eq(repositories.id, input.repoId))
						.limit(1);
					if (repoRow) {
						const [owner, repoName] = repoRow.fullName.split("/");
						const num = parseInt(input.ref.replace("#", ""), 10);
						if (!isNaN(num) && owner && repoName) {
							if (input.kind === "pr") {
								const pr = await githubApi(`/repos/${owner}/${repoName}/pulls/${num}`, token).catch(() => null);
								if (pr) {
									contentText = [pr.title, pr.body].filter(Boolean).join("\n\n");
									contentMeta = {
										title: pr.title as string,
										number: num,
										url: pr.html_url as string,
										state: (pr.merged_at as string) ? "merged" : (pr.state as string),
									};
								}
							} else if (input.kind === "issue") {
								const issue = await githubApi(`/repos/${owner}/${repoName}/issues/${num}`, token).catch(() => null);
								if (issue) {
									contentText = [issue.title, issue.body].filter(Boolean).join("\n\n");
									contentMeta = {
										title: issue.title as string,
										number: num,
										url: issue.html_url as string,
										state: issue.state as string,
									};
								}
							}
						}
					}
				} catch { /* content fetch failed — continue with user-only data */ }
			}

			// 3. Simulate each workflow
			const results = activeWorkflows.map((wf) => {
				const def = wf.definition as { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>> };
				const nodes = def.nodes ?? [];
				const edges = def.edges ?? [];

				// Walk the graph — simplified simulation matching the client-side engine
				const nodeMap = new Map(nodes.map((n) => [n.id as string, n]));
				const outgoing = new Map<string, Array<Record<string, unknown>>>();
				for (const e of edges) {
					const src = e.source as string;
					if (!outgoing.has(src)) outgoing.set(src, []);
					outgoing.get(src)!.push(e);
				}

				const outcomes: Array<{ nodeId: string; type: string; label: string; status: string; detail: string }> = [];
				const nodeOutcome = new Map<string, boolean>();
				const triggers = nodes.filter((n) => n.type === "trigger");
				const queue = triggers.map((n) => n.id as string);
				const visited = new Set<string>();

				for (const t of triggers) {
					outcomes.push({ nodeId: t.id as string, type: "trigger", label: (t.data as Record<string, unknown>)?.trigger as string ?? "trigger", status: "executed", detail: "Triggered" });
					nodeOutcome.set(t.id as string, true);
				}

				while (queue.length > 0) {
					const current = queue.shift()!;
					if (visited.has(current)) continue;
					visited.add(current);
					const outs = outgoing.get(current) ?? [];
					for (const edge of outs) {
						const targetId = edge.target as string;
						const targetNode = nodeMap.get(targetId);
						if (!targetNode || visited.has(targetId)) continue;
						const sourceOutcome = nodeOutcome.get(current);
						const sourceHandle = edge.sourceHandle as string | undefined;
						const sourceNode = nodeMap.get(current);
						if (sourceNode && (sourceNode.type === "rule" || sourceNode.type === "condition")) {
							if (sourceHandle === "pass" && sourceOutcome === false) continue;
							if (sourceHandle === "fail" && sourceOutcome === true) continue;
							if (sourceHandle === "true" && sourceOutcome === false) continue;
							if (sourceHandle === "false" && sourceOutcome === true) continue;
						}

						let pass = true;
						let detail = "";
						const data = (targetNode.data as Record<string, unknown>) ?? {};
						const ud = userData?.data ?? {};

						if (targetNode.type === "rule") {
							const rule = data.rule as string;
							const params = data.params as Record<string, unknown> | undefined;
							if (rule === "accountAge") { pass = (ud.accountAgeDays as number ?? 0) >= ((params?.days as number) ?? 30); detail = `Account ${ud.accountAgeDays}d (need ${(params?.days as number) ?? 30}d)`; }
							else if (rule === "minMergedPrs") { pass = (ud.mergedPrs as number ?? 0) >= ((params?.count as number) ?? 15); detail = `${ud.mergedPrs} merged PRs (need ${(params?.count as number) ?? 15})`; }
							else if (rule === "repoActivityMinimum") { pass = (ud.publicNonForkRepos as number ?? 0) >= ((params?.minRepos as number) ?? 3); detail = `${ud.publicNonForkRepos} repos (need ${(params?.minRepos as number) ?? 3})`; }
							else if (rule === "requireProfileReadme") { pass = !!ud.hasProfileReadme; detail = pass ? "README exists" : "No README"; }
							else if (rule === "contributorScore") { pass = (ud.score as number ?? 0) >= ((params?.minScore as number) ?? 50); detail = `Score ${ud.score} (need ${(params?.minScore as number) ?? 50})`; }
							else { pass = true; detail = "No simulation data"; }
						} else if (targetNode.type === "condition") {
							const field = data.field as string;
							const op = data.operator as string;
							const val = parseFloat(String(data.value));
							const actual = ud[field] as number ?? 0;
							if (op === ">") pass = actual > val;
							else if (op === ">=") pass = actual >= val;
							else if (op === "<") pass = actual < val;
							else if (op === "<=") pass = actual <= val;
							else if (op === "==") pass = actual === val;
							else if (op === "!=") pass = actual !== val;
							detail = `${field} is ${actual} (${op} ${val})`;
						} else if (targetNode.type === "logic") {
							const gate = data.gate as string;
							const incoming = edges.filter((e) => e.target === targetId);
							const inputs = incoming.map((e) => nodeOutcome.get(e.source as string)).filter((v) => v !== undefined) as boolean[];
							if (gate === "AND") pass = inputs.length > 0 && inputs.every(Boolean);
							else if (gate === "OR") pass = inputs.some(Boolean);
							else if (gate === "NOT") pass = inputs.length > 0 && !inputs[0];
							detail = `${gate}(${inputs.map((r) => r ? "T" : "F").join(", ")})`;
						} else if (targetNode.type === "action") {
							detail = `Would: ${data.action as string}`;
							if (data.message) detail += ` — "${data.message}"`;
						} else {
							detail = "Processed";
						}

						const status = targetNode.type === "action" ? "executed" : pass ? "pass" : "fail";
						outcomes.push({ nodeId: targetId, type: targetNode.type as string, label: data.rule as string ?? data.action as string ?? data.gate as string ?? targetNode.type as string, status, detail });
						nodeOutcome.set(targetId, pass);
						queue.push(targetId);
					}
				}

				// Overall result: if any action node was reached, determine the final actions
				const actions = outcomes.filter((o) => o.type === "action");
				const hasBlock = actions.some((a) => a.label === "block" || a.detail.includes("block"));

				return {
					workflowId: wf.id,
					workflowName: wf.name,
					nodeCount: nodes.length,
					result: hasBlock ? "blocked" as const : actions.length > 0 ? "allowed" as const : "no-action" as const,
					outcomes,
					actions: actions.map((a) => a.detail),
				};
			});

			return { username: input.username, kind: input.kind ?? "user", results, userData, contentMeta, contentText: contentText ? contentText.slice(0, 500) : null };
		}),

	// ─── Admin endpoints (internal data collection) ────────────

	/** Scan an entire repo's contributors — admin only, no repo ownership check */
	adminScanRepo: adminProcedure
		.input(z.object({
			/** owner/repo format */
			repo: z.string().min(1),
			/** GitHub installation ID to use for auth */
			installationId: z.number().int(),
			/** How many contributors to scan (default 30) */
			limit: z.number().int().min(1).max(500).optional(),
		}))
		.mutation(async ({ input }) => {
			const token = await getInstallationToken(input.installationId);
			const limit = input.limit ?? 30;

			// Fetch recent PRs to find unique contributors
			const searchResult = await githubApi(
				`/search/issues?q=repo:${encodeURIComponent(input.repo)}+type:pr+is:merged&sort=created&order=desc&per_page=${Math.min(limit * 2, 100)}`,
				token,
			);
			const rawItems = (searchResult?.items as Array<Record<string, unknown>>) ?? [];

			// Dedupe by author
			const seen = new Set<string>();
			const contributors: Array<{ login: string; avatar: string; prCount: number }> = [];
			for (const item of rawItems) {
				const user = (item.user as Record<string, unknown>) ?? {};
				const login = (user.login as string) ?? "";
				if (!login || seen.has(login.toLowerCase())) continue;
				seen.add(login.toLowerCase());
				contributors.push({
					login,
					avatar: (user.avatar_url as string) ?? "",
					prCount: 1,
				});
				if (contributors.length >= limit) break;
			}

			// Count PRs per contributor
			for (const item of rawItems) {
				const login = ((item.user as Record<string, unknown>)?.login as string) ?? "";
				const c = contributors.find((x) => x.login.toLowerCase() === login.toLowerCase());
				if (c && c.prCount === 1) {
					// already counted first one above, just increment
				} else if (c) {
					c.prCount++;
				}
			}

			return {
				repo: input.repo,
				totalPrsScanned: rawItems.length,
				contributors,
			};
		}),

	/** Scan a batch of PRs from any repo — admin only */
	adminScanPRs: adminProcedure
		.input(z.object({
			repo: z.string().min(1),
			installationId: z.number().int(),
			/** PR state to scan */
			state: z.enum(["merged", "closed", "open", "all"]).optional(),
			limit: z.number().int().min(1).max(100).optional(),
		}))
		.mutation(async ({ input }) => {
			const token = await getInstallationToken(input.installationId);
			const limit = input.limit ?? 25;
			const state = input.state ?? "merged";
			const stateFilter = state === "all" ? "" : `+is:${state}`;

			const searchResult = await githubApi(
				`/search/issues?q=repo:${encodeURIComponent(input.repo)}+type:pr${stateFilter}&sort=created&order=desc&per_page=${limit}`,
				token,
			);

			const rawItems = (searchResult?.items as Array<Record<string, unknown>>) ?? [];

			const prs = rawItems.map((item) => {
				const user = (item.user as Record<string, unknown>) ?? {};
				const pr = (item.pull_request as Record<string, unknown>) ?? {};
				return {
					number: (item.number as number) ?? 0,
					title: (item.title as string) ?? "",
					author: (user.login as string) ?? "",
					authorAvatar: (user.avatar_url as string) ?? "",
					state: (pr.merged_at as string) ? "merged" : (item.state as string) ?? "open",
					createdAt: (item.created_at as string) ?? "",
					mergedAt: (pr.merged_at as string) ?? null,
					closedAt: (item.closed_at as string) ?? null,
					url: (item.html_url as string) ?? "",
				};
			});

			return {
				repo: input.repo,
				totalCount: (searchResult?.total_count as number) ?? 0,
				prs,
			};
		}),

	/** Bulk score multiple users — admin only, for research/analysis */
	adminBulkScore: adminProcedure
		.input(z.object({
			usernames: z.array(z.string().min(1)).min(1).max(50),
			installationId: z.number().int(),
		}))
		.mutation(async ({ input }) => {
			const token = await getInstallationToken(input.installationId);

			const results = [];
			for (const username of input.usernames) {
				try {
					const [ghUser, mergedPrs, publicNonForkRepos, profileReadme] = await Promise.all([
						getUser(token, username).catch(() => null),
						getMergedPrCount(token, username).catch(() => 0),
						getPublicNonForkRepoCount(token, username).catch(() => 0),
						hasProfileReadme(token, username).catch(() => false),
					]);

					if (!ghUser) {
						results.push({ username, found: false as const });
						continue;
					}

					const createdAt = new Date((ghUser as Record<string, unknown>).created_at as string);
					const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / 86_400_000);

					const score = computeContributorScore({
						accountAgeDays,
						followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
						following: (ghUser as Record<string, unknown>).following as number ?? 0,
						publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
						publicNonForkRepoCount: publicNonForkRepos,
						publicForkRepoCount: 0,
						contextRepoPrCount: 0,
						publicGists: (ghUser as Record<string, unknown>).public_gists as number ?? 0,
						bio: (ghUser as Record<string, unknown>).bio as string ?? null,
						company: (ghUser as Record<string, unknown>).company as string ?? null,
						location: (ghUser as Record<string, unknown>).location as string ?? null,
						blog: (ghUser as Record<string, unknown>).blog as string ?? null,
						twitterUsername: (ghUser as Record<string, unknown>).twitter_username as string ?? null,
						hasTwoFactor: false,
						hasProfileReadme: profileReadme,
						graphql: null,
						achievements: [],
						mergedPrCount: mergedPrs,
						closedPrCount: 0,
						closedUnmergedPrCount: 0,
						blockedCount: 0,
						allowedCount: 0,
						nearMissCount: 0,
					});

					results.push({
						username,
						found: true as const,
						score: score.total,
						accountAgeDays,
						mergedPrs,
						publicRepos: (ghUser as Record<string, unknown>).public_repos as number ?? 0,
						followers: (ghUser as Record<string, unknown>).followers as number ?? 0,
					});
				} catch {
					results.push({ username, found: false as const });
				}
			}

			return { results };
		}),
} satisfies TRPCRouterRecord;
