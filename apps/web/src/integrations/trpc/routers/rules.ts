import { z } from "zod";
import { eq } from "drizzle-orm";
import { authedProcedure } from "../init";
import { assertRepoOwner } from "@tripwire/core";
import { db } from "@tripwire/db/client";
import {
	ruleConfigs,
	whitelistEntries,
	blacklistEntries,
	organizations,
	repositories,
	DEFAULT_RULE_CONFIG,
	type RuleConfig,
} from "@tripwire/db";
import { logEvent } from '@tripwire/core';
import { describeRuleConfigChanges, normalizeRuleConfig } from '@tripwire/core';
import { ruleConfigSchema } from '@tripwire/core';
import { getInstallationToken, putRepoFile } from '@tripwire/github';
import {
	generateHoneypotPhrase,
	generatePrTemplate,
	generateRulesMd,
	pickHoneypotPhrase,
} from '@tripwire/github';

import type { TRPCRouterRecord } from "@trpc/server";

type RepoRow = typeof repositories.$inferSelect;
type OrgRow = typeof organizations.$inferSelect;

export const rulesRouter = {
	/** Get rule config for a repo */
	getConfig: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input, ctx }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			const [config] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));
			return config?.config ?? DEFAULT_RULE_CONFIG;
		}),

	/** Update rule config for a repo (upsert) */
	updateConfig: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				config: ruleConfigSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { repo, org } = await assertRepoOwner(ctx.user.id, input.repoId);

			const [existing] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));

			const previousConfig = normalizeRuleConfig(existing?.config ?? DEFAULT_RULE_CONFIG);
			let nextConfig = normalizeRuleConfig(input.config);

			// If the honeypot was just enabled and no phrases exist yet, mint one.
			if (
				nextConfig.repoFiles.prTemplate.honeypotEnabled &&
				nextConfig.repoFiles.prTemplate.honeypotPhrases.length === 0
			) {
				nextConfig = {
					...nextConfig,
					repoFiles: {
						...nextConfig.repoFiles,
						prTemplate: {
							...nextConfig.repoFiles.prTemplate,
							honeypotPhrases: [generateHoneypotPhrase()],
						},
					},
				};
			}

			if (existing) {
				await db
					.update(ruleConfigs)
					.set({ config: nextConfig, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, input.repoId));
			} else {
				await db.insert(ruleConfigs).values({
					repoId: input.repoId,
					config: nextConfig,
				});
			}

			const changes = describeRuleConfigChanges(previousConfig, nextConfig);

			await logEvent({
				repoId: input.repoId,
				action: "rule_config_updated",
				severity: "info",
				description: changes.length > 0
					? `Rules updated: ${changes.join(", ")}`
					: "Rule configuration updated",
				metadata: {
					updatedBy: ctx.user?.name ?? ctx.user?.id,
					changes,
					newConfig: nextConfig,
				},
			});

			// Auto-sync repo files when their toggles are on. Errors are
			// logged but don't fail the save — these are best-effort writes.
			if (nextConfig.repoFiles.rulesMd.autoSync) {
				void syncRepoFileSafe(repo, org, "rules-md", nextConfig);
			}
			if (nextConfig.repoFiles.prTemplate.autoSync) {
				void syncRepoFileSafe(repo, org, "pr-template", nextConfig);
			}

			return nextConfig;
		}),

	/** Persist a user-edited override for RULES.md or PR template content. */
	updateRepoFileContent: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				kind: z.enum(["rules-md", "pr-template"]),
				content: z.string().max(50_000),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			const [existing] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));
			const current = normalizeRuleConfig(existing?.config ?? DEFAULT_RULE_CONFIG);
			const next: RuleConfig =
				input.kind === "rules-md"
					? {
							...current,
							repoFiles: {
								...current.repoFiles,
								rulesMd: { ...current.repoFiles.rulesMd, customContent: input.content },
							},
						}
					: {
							...current,
							repoFiles: {
								...current.repoFiles,
								prTemplate: { ...current.repoFiles.prTemplate, customContent: input.content },
							},
						};
			if (existing) {
				await db
					.update(ruleConfigs)
					.set({ config: next, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, input.repoId));
			} else {
				await db.insert(ruleConfigs).values({ repoId: input.repoId, config: next });
			}
			return { ok: true as const };
		}),

	/** Manually push the generated RULES.md or PR template to the repo. */
	syncRepoFile: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				kind: z.enum(["rules-md", "pr-template"]),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const { repo, org } = await assertRepoOwner(ctx.user.id, input.repoId);
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));
			const config = normalizeRuleConfig(configRow?.config ?? DEFAULT_RULE_CONFIG);
			const result = await syncRepoFile(repo, org, input.kind, config);
			return result;
		}),

	/** Count enabled rules for a repo */
	countEnabled: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input, ctx }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));

			const config = configRow?.config ?? DEFAULT_RULE_CONFIG;
			let enabledCount = 0;

			for (const value of Object.values(config)) {
				if (typeof value === "object" && value !== null && "enabled" in value) {
					if ((value as { enabled: boolean }).enabled) {
						enabledCount++;
					}
				}
			}

			return { enabled: enabledCount, total: Object.keys(config).length };
		}),

	/** Export config as JSON (for copy-to-another-repo) */
	exportConfig: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input, ctx }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);
			const [config] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));

			const whitelist = await db
				.select()
				.from(whitelistEntries)
				.where(eq(whitelistEntries.repoId, input.repoId));

			const blacklist = await db
				.select()
				.from(blacklistEntries)
				.where(eq(blacklistEntries.repoId, input.repoId));

			return {
				rules: config?.config ?? DEFAULT_RULE_CONFIG,
				whitelist: whitelist.map((w) => w.githubUsername),
				blacklist: blacklist.map((b) => b.githubUsername),
			};
		}),

	/** Import config from JSON */
	importConfig: authedProcedure
		.input(
			z.object({
				repoId: z.string().uuid(),
				config: ruleConfigSchema,
				whitelist: z.array(z.string()).optional(),
				blacklist: z.array(z.string()).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await assertRepoOwner(ctx.user.id, input.repoId);

			// Persist rule config + whitelist + blacklist atomically. If the lists
			// fail to insert we don't want the rule config drifting from them.
			//
			// TODO: conflict-resolution policy between whitelist and blacklist on
			// import. Today we accept the imported data as-is — if a username
			// shows up on both lists in the source repo, both rows land here.
			// The unique-per-list indexes still prevent duplicates within a list.
			await db.transaction(async (tx) => {
				const [existing] = await tx
					.select()
					.from(ruleConfigs)
					.where(eq(ruleConfigs.repoId, input.repoId));

				if (existing) {
					await tx
						.update(ruleConfigs)
						.set({ config: input.config, updatedAt: new Date() })
						.where(eq(ruleConfigs.repoId, input.repoId));
				} else {
					await tx.insert(ruleConfigs).values({
						repoId: input.repoId,
						config: input.config,
					});
				}

				if (input.whitelist && input.whitelist.length > 0) {
					await tx
						.insert(whitelistEntries)
						.values(
							input.whitelist.map((githubUsername) => ({
								repoId: input.repoId,
								githubUsername,
								addedById: ctx.user.id,
							})),
						)
						.onConflictDoNothing();
				}

				if (input.blacklist && input.blacklist.length > 0) {
					await tx
						.insert(blacklistEntries)
						.values(
							input.blacklist.map((githubUsername) => ({
								repoId: input.repoId,
								githubUsername,
								addedById: ctx.user.id,
							})),
						)
						.onConflictDoNothing();
				}
			});

			return { success: true };
		}),
} satisfies TRPCRouterRecord;


type RepoFileKind = "rules-md" | "pr-template";

async function syncRepoFile(
	repo: RepoRow,
	org: OrgRow,
	kind: RepoFileKind,
	config: RuleConfig,
): Promise<{ kind: RepoFileKind; path: string }> {
	const token = await getInstallationToken(org.githubInstallationId);
	const [owner, repoName] = repo.fullName.split("/");

	if (kind === "rules-md") {
		const custom = config.repoFiles.rulesMd.customContent;
		const content = custom.trim().length > 0 ? custom : generateRulesMd(config, repo.fullName);
		await putRepoFile(token, owner, repoName, "RULES.md", content, "chore: sync Tripwire RULES.md");
		return { kind, path: "RULES.md" };
	}

	const phrase = config.repoFiles.prTemplate.honeypotEnabled
		? pickHoneypotPhrase(config.repoFiles.prTemplate.honeypotPhrases)
		: undefined;
	const customPr = config.repoFiles.prTemplate.customContent;
	const content =
		customPr.trim().length > 0 ? customPr : generatePrTemplate(config, phrase);
	const path = ".github/PULL_REQUEST_TEMPLATE.md";
	await putRepoFile(token, owner, repoName, path, content, "chore: sync Tripwire PR template");
	return { kind, path };
}

async function syncRepoFileSafe(
	repo: RepoRow,
	org: OrgRow,
	kind: RepoFileKind,
	config: RuleConfig,
): Promise<void> {
	try {
		await syncRepoFile(repo, org, kind, config);
	} catch (err) {
		console.error(`[repo-files] auto-sync ${kind} failed for ${repo.id}:`, err);
	}
}

