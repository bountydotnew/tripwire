import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authedProcedure } from "../init";
import { db } from "#/db";
import {
	ruleConfigs,
	whitelistEntries,
	blacklistEntries,
	repositories,
	organizations,
	DEFAULT_RULE_CONFIG,
	type RuleConfig,
} from "#/db/schema";
import { logEvent } from "#/lib/events";
import { describeRuleConfigChanges, normalizeRuleConfig } from "#/lib/rules/config-draft";
import { getInstallationToken, putRepoFile } from "#/lib/github/github-api";
import {
	generateHoneypotPhrase,
	generatePrTemplate,
	generateRulesMd,
	pickHoneypotPhrase,
} from "#/lib/github/repo-files";

import type { TRPCRouterRecord } from "@trpc/server";

const ruleActionSchema = z.enum(["block", "warn", "log", "threshold"]);

const ruleBaseSchema = z.object({
	enabled: z.boolean(),
	action: ruleActionSchema.default("block"),
	thresholdCount: z.number().int().min(1).optional(),
});

const ruleConfigSchema = z.object({
	aiSlopDetection: ruleBaseSchema,
	languageRequirement: ruleBaseSchema.extend({
		language: z.string(),
	}),
	minMergedPrs: ruleBaseSchema.extend({ count: z.number().int().min(0) }),
	accountAge: ruleBaseSchema.extend({ days: z.number().int().min(0) }),
	maxPrsPerDay: ruleBaseSchema.extend({ limit: z.number().int().min(1) }),
	maxFilesChanged: ruleBaseSchema.extend({ limit: z.number().int().min(1) }),
	repoActivityMinimum: ruleBaseSchema.extend({ minRepos: z.number().int().min(1) }),
	requireProfileReadme: ruleBaseSchema,
	cryptoAddressDetection: ruleBaseSchema,
	vouchedUsersOnly: ruleBaseSchema,
	aiHoneypot: ruleBaseSchema,
	contentScope: z.object({
		pullRequests: z.boolean(),
		issues: z.boolean(),
		comments: z.boolean(),
	}),
	repoFiles: z.object({
		rulesMd: z.object({
			autoSync: z.boolean(),
			customContent: z.string(),
		}),
		prTemplate: z.object({
			autoSync: z.boolean(),
			honeypotEnabled: z.boolean(),
			honeypotPhrases: z.array(
				z.object({
					kind: z.enum(["codeword", "marker", "natural", "tag"]),
					phrase: z.string().min(1),
				}),
			),
			customContent: z.string(),
		}),
	}),
});

export const rulesRouter = {
	/** Get rule config for a repo */
	getConfig: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
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
				void syncRepoFileSafe(input.repoId, "rules-md", nextConfig);
			}
			if (nextConfig.repoFiles.prTemplate.autoSync) {
				void syncRepoFileSafe(input.repoId, "pr-template", nextConfig);
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
		.mutation(async ({ input }) => {
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
		.mutation(async ({ input }) => {
			const [configRow] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));
			const config = normalizeRuleConfig(configRow?.config ?? DEFAULT_RULE_CONFIG);
			const result = await syncRepoFile(input.repoId, input.kind, config);
			return result;
		}),

	/** Count enabled rules for a repo */
	countEnabled: authedProcedure
		.input(z.object({ repoId: z.string().uuid() }))
		.query(async ({ input }) => {
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
		.query(async ({ input }) => {
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
		.mutation(async ({ input }) => {
			// Upsert rule config
			const [existing] = await db
				.select()
				.from(ruleConfigs)
				.where(eq(ruleConfigs.repoId, input.repoId));

			if (existing) {
				await db
					.update(ruleConfigs)
					.set({ config: input.config, updatedAt: new Date() })
					.where(eq(ruleConfigs.repoId, input.repoId));
			} else {
				await db.insert(ruleConfigs).values({
					repoId: input.repoId,
					config: input.config,
				});
			}

			return { success: true };
		}),
} satisfies TRPCRouterRecord;

// ─── repo-file sync helpers ───────────────────────────────────────

type RepoFileKind = "rules-md" | "pr-template";

async function syncRepoFile(
	repoId: string,
	kind: RepoFileKind,
	config: RuleConfig,
): Promise<{ kind: RepoFileKind; path: string }> {
	const [repo] = await db
		.select({
			fullName: repositories.fullName,
			orgId: repositories.orgId,
		})
		.from(repositories)
		.where(eq(repositories.id, repoId));
	if (!repo) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Repository not found." });
	}
	const [org] = await db
		.select({ installationId: organizations.githubInstallationId })
		.from(organizations)
		.where(eq(organizations.id, repo.orgId));
	if (!org) {
		throw new TRPCError({ code: "NOT_FOUND", message: "GitHub installation not found." });
	}

	const token = await getInstallationToken(org.installationId);
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
	repoId: string,
	kind: RepoFileKind,
	config: RuleConfig,
): Promise<void> {
	try {
		await syncRepoFile(repoId, kind, config);
	} catch (err) {
		console.error(`[repo-files] auto-sync ${kind} failed for ${repoId}:`, err);
	}
}

