import { z } from "zod";
import { eq } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "#/db";
import {
	ruleConfigs,
	whitelistEntries,
	blacklistEntries,
	DEFAULT_RULE_CONFIG,
} from "#/db/schema";
import { logEvent } from "#/lib/events";
import { describeRuleConfigChanges, normalizeRuleConfig } from "#/lib/rules/config-draft";

import type { TRPCRouterRecord } from "@trpc/server";

const ruleActionSchema = z.enum(["block", "warn", "log", "threshold"]);

const ruleBaseSchema = z.object({
	enabled: z.boolean(),
	action: ruleActionSchema.default("block"),
	thresholdCount: z.number().int().min(1).optional(),
});

const ruleConfigSchema = z.object({
	aiSlopDetection: ruleBaseSchema,
	requireProfilePicture: ruleBaseSchema,
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
			const nextConfig = normalizeRuleConfig(input.config);

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

			return nextConfig;
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
