import { z } from "zod";

const ruleActionSchema = z.enum(["block", "warn", "log", "threshold"]);

const ruleBaseSchema = z.object({
	enabled: z.boolean(),
	action: ruleActionSchema.default("block"),
	thresholdCount: z.number().int().min(1).optional(),
});

export const ruleConfigSchema = z.object({
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
});
