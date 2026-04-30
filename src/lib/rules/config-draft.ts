import { DEFAULT_RULE_CONFIG, type RuleAction, type RuleConfig } from "#/db/schema";

export type RuleConfigChangeTone = "neutral" | "muted" | "accent" | "success" | "warning" | "danger";

export interface RuleConfigChange {
	id: string;
	ruleKey: keyof RuleConfig;
	field: string;
	label: string;
	title: string;
	before?: string;
	after?: string;
	beforeTone?: RuleConfigChangeTone;
	afterTone?: RuleConfigChangeTone;
}

type RuleKey = keyof RuleConfig;
type RuleField = keyof RuleConfig[RuleKey];

const RULE_ORDER = Object.keys(DEFAULT_RULE_CONFIG) as RuleKey[];

const RULE_LABELS: Record<RuleKey, string> = {
	aiSlopDetection: "AI slop detection",
languageRequirement: "Language requirement",
	minMergedPrs: "Minimum merged PRs",
	accountAge: "Account age",
	maxPrsPerDay: "Max PRs per day",
	maxFilesChanged: "Max files changed",
	repoActivityMinimum: "Repo activity minimum",
	requireProfileReadme: "Require profile README",
	cryptoAddressDetection: "Crypto address detection",
};

const ACTION_LABELS: Record<RuleAction, string> = {
	block: "Block",
	warn: "Warn",
	log: "Log",
	threshold: "Threshold",
};

const FIELD_ORDER: Record<RuleKey, string[]> = {
	aiSlopDetection: ["enabled", "action", "thresholdCount"],
languageRequirement: ["enabled", "action", "language", "thresholdCount"],
	minMergedPrs: ["enabled", "action", "count", "thresholdCount"],
	accountAge: ["enabled", "action", "days", "thresholdCount"],
	maxPrsPerDay: ["enabled", "action", "limit", "thresholdCount"],
	maxFilesChanged: ["enabled", "action", "limit", "thresholdCount"],
	repoActivityMinimum: ["enabled", "action", "minRepos", "thresholdCount"],
	requireProfileReadme: ["enabled", "action", "thresholdCount"],
	cryptoAddressDetection: ["enabled", "action", "thresholdCount"],
};

function formatScalar(value: unknown): string {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	if (value === undefined || value === null) return "none";
	return JSON.stringify(value);
}

function formatAction(value: unknown): string {
	return ACTION_LABELS[value as RuleAction] ?? formatScalar(value);
}

function actionTone(value: unknown): RuleConfigChangeTone {
	switch (value as RuleAction) {
		case "block":
			return "danger";
		case "warn":
			return "warning";
		case "threshold":
			return "accent";
		case "log":
		default:
			return "muted";
	}
}

function stateTone(value: unknown): RuleConfigChangeTone {
	return value ? "success" : "muted";
}

function getOrderedFields(ruleKey: RuleKey, baseRule: RuleConfig[RuleKey], draftRule: RuleConfig[RuleKey]): string[] {
	const knownFields = FIELD_ORDER[ruleKey];
	const extraFields = Array.from(
		new Set([...Object.keys(baseRule), ...Object.keys(draftRule)].filter((field) => !knownFields.includes(field))),
	).sort();
	return [...knownFields, ...extraFields];
}

function buildChange(ruleKey: RuleKey, field: string, previousValue: unknown, nextValue: unknown): RuleConfigChange {
	const ruleLabel = RULE_LABELS[ruleKey];
	const id = `${ruleKey}.${field}`;

	if (field === "enabled") {
		const before = previousValue ? "Enabled" : "Disabled";
		const after = nextValue ? "Enabled" : "Disabled";
		return {
			id,
			ruleKey,
			field,
			title: ruleLabel,
			before,
			after,
			beforeTone: stateTone(previousValue),
			afterTone: stateTone(nextValue),
			label: `${ruleLabel} changed to ${before} -> ${after}`,
		};
	}

	if (field === "action") {
		const before = formatAction(previousValue);
		const after = formatAction(nextValue);
		return {
			id,
			ruleKey,
			field,
			title: `${ruleLabel} action`,
			before,
			after,
			beforeTone: actionTone(previousValue),
			afterTone: actionTone(nextValue),
			label: `${ruleLabel} action changed to ${before} -> ${after}`,
		};
	}

	if (field === "language") {
		const after = formatScalar(nextValue);
		return {
			id,
			ruleKey,
			field,
			title: ruleLabel,
			before: previousValue !== undefined ? formatScalar(previousValue) : undefined,
			after,
			beforeTone: "muted",
			afterTone: "accent",
			label: `${ruleLabel} changed to ${previousValue !== undefined ? `${formatScalar(previousValue)} -> ` : ""}${after}`,
		};
	}

	if (nextValue === undefined) {
		return {
			id,
			ruleKey,
			field,
			title: `${ruleLabel} ${field}`,
			before: formatScalar(previousValue),
			after: "Cleared",
			beforeTone: "neutral",
			afterTone: "muted",
			label: `${ruleLabel} ${field} changed to ${formatScalar(previousValue)} -> Cleared`,
		};
	}

	if (previousValue === undefined) {
		return {
			id,
			ruleKey,
			field,
			title: `${ruleLabel} ${field}`,
			before: "Unset",
			after: formatScalar(nextValue),
			beforeTone: "muted",
			afterTone: "accent",
			label: `${ruleLabel} ${field} changed to Unset -> ${formatScalar(nextValue)}`,
		};
	}

	return {
		id,
		ruleKey,
		field,
		title: `${ruleLabel} ${field}`,
		before: formatScalar(previousValue),
		after: formatScalar(nextValue),
		beforeTone: "neutral",
		afterTone: "accent",
		label: `${ruleLabel} ${field} changed to ${formatScalar(previousValue)} -> ${formatScalar(nextValue)}`,
	};
}

export function normalizeRuleConfig(raw?: Partial<RuleConfig>): RuleConfig {
	return {
		aiSlopDetection: { ...DEFAULT_RULE_CONFIG.aiSlopDetection, ...raw?.aiSlopDetection },
languageRequirement: { ...DEFAULT_RULE_CONFIG.languageRequirement, ...raw?.languageRequirement },
		minMergedPrs: { ...DEFAULT_RULE_CONFIG.minMergedPrs, ...raw?.minMergedPrs },
		accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...raw?.accountAge },
		maxPrsPerDay: { ...DEFAULT_RULE_CONFIG.maxPrsPerDay, ...raw?.maxPrsPerDay },
		maxFilesChanged: { ...DEFAULT_RULE_CONFIG.maxFilesChanged, ...raw?.maxFilesChanged },
		repoActivityMinimum: { ...DEFAULT_RULE_CONFIG.repoActivityMinimum, ...raw?.repoActivityMinimum },
		requireProfileReadme: { ...DEFAULT_RULE_CONFIG.requireProfileReadme, ...raw?.requireProfileReadme },
		cryptoAddressDetection: { ...DEFAULT_RULE_CONFIG.cryptoAddressDetection, ...raw?.cryptoAddressDetection },
	};
}

export function getRuleConfigChanges(base: RuleConfig, draft: RuleConfig): RuleConfigChange[] {
	const normalizedBase = normalizeRuleConfig(base);
	const normalizedDraft = normalizeRuleConfig(draft);
	const changes: RuleConfigChange[] = [];

	for (const ruleKey of RULE_ORDER) {
		const baseRule = normalizedBase[ruleKey];
		const draftRule = normalizedDraft[ruleKey];

		for (const field of getOrderedFields(ruleKey, baseRule, draftRule)) {
			if (Object.is(baseRule[field as RuleField], draftRule[field as RuleField])) {
				continue;
			}

			changes.push(
				buildChange(ruleKey, field, baseRule[field as RuleField], draftRule[field as RuleField]),
			);
		}
	}

	return changes;
}

export function areRuleConfigsEqual(a: RuleConfig, b: RuleConfig): boolean {
	return getRuleConfigChanges(a, b).length === 0;
}

export function revertRuleConfigChange(base: RuleConfig, draft: RuleConfig, changeId: string): RuleConfig {
	const [ruleKey, field] = changeId.split(".", 2) as [RuleKey | undefined, string | undefined];

	if (!ruleKey || !field || !RULE_ORDER.includes(ruleKey)) {
		return normalizeRuleConfig(draft);
	}

	const normalizedBase = normalizeRuleConfig(base);
	const normalizedDraft = normalizeRuleConfig(draft);
	const nextDraft: RuleConfig = {
		...normalizedDraft,
		[ruleKey]: { ...normalizedDraft[ruleKey] },
	};

	const baseValue = normalizedBase[ruleKey][field as RuleField];
	if (baseValue === undefined) {
		delete (nextDraft[ruleKey] as Record<string, unknown>)[field];
	} else {
		(nextDraft[ruleKey] as Record<string, unknown>)[field] = baseValue;
	}

	return normalizeRuleConfig(nextDraft);
}

export function describeRuleConfigChanges(previous: RuleConfig, next: RuleConfig): string[] {
	return getRuleConfigChanges(previous, next).map((change) => change.label);
}
