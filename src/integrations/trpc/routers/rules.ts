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

import type { TRPCRouterRecord } from "@trpc/server";

const ruleConfigSchema = z.object({
	aiSlopDetection: z.object({ enabled: z.boolean() }),
	requireProfilePicture: z.object({ enabled: z.boolean() }),
	languageRequirement: z.object({
		enabled: z.boolean(),
		language: z.string(),
	}),
	minMergedPrs: z.object({ enabled: z.boolean(), count: z.number().int().min(0) }),
	accountAge: z.object({ enabled: z.boolean(), days: z.number().int().min(0) }),
	maxPrsPerDay: z.object({ enabled: z.boolean(), limit: z.number().int().min(1) }),
	maxFilesChanged: z.object({ enabled: z.boolean(), limit: z.number().int().min(1) }),
	repoActivityMinimum: z.object({ enabled: z.boolean(), minRepos: z.number().int().min(1) }),
	requireProfileReadme: z.object({ enabled: z.boolean() }),
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

			const previousConfig = existing?.config ?? DEFAULT_RULE_CONFIG;

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

			// Build a human-readable summary of what changed
			const changes: string[] = [];
			for (const [key, value] of Object.entries(input.config)) {
				const prev = previousConfig[key as keyof typeof previousConfig];
				const curr = value as Record<string, unknown>;
				const prevObj = prev as Record<string, unknown>;

				if (prevObj?.enabled !== curr.enabled) {
					changes.push(`${key}: ${curr.enabled ? "enabled" : "disabled"}`);
				}
			}

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
					newConfig: input.config,
				},
			});

			return input.config;
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
