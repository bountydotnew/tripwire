import { jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { repositories } from "./installations";

/**
 * What happens when a rule is violated.
 *
 * - "block"     — close the PR/issue or delete the comment (default)
 * - "warn"      — leave a Tripwire comment but don't close
 * - "log"       — record the event silently, take no GitHub action
 * - "threshold" — ignore until `thresholdCount` violations, then block
 */
export type RuleAction = "block" | "warn" | "log" | "threshold";

/** Base fields every rule shares */
type RuleBase = {
	enabled: boolean;
	action: RuleAction;
	/** Only used when action === "threshold" */
	thresholdCount?: number;
	/** Per-rule override on the repo-wide contentScope. Absent keys inherit. */
	scopeOverride?: {
		pullRequests?: boolean;
		issues?: boolean;
		comments?: boolean;
	};
};

export type ContentScope = {
	pullRequests: boolean;
	issues: boolean;
	comments: boolean;
};

export type HoneypotPhraseKind = "codeword" | "marker" | "natural" | "tag";
export type HoneypotPhrase = { kind: HoneypotPhraseKind; phrase: string };

export type RepoFilesConfig = {
	rulesMd: { autoSync: boolean; customContent: string };
	prTemplate: {
		autoSync: boolean;
		honeypotEnabled: boolean;
		honeypotPhrases: HoneypotPhrase[];
		customContent: string;
	};
	agentsMd: {
		autoSync: boolean;
		honeypotEnabled: boolean;
		honeypotPhrases: HoneypotPhrase[];
		customContent: string;
	};
};

export type RuleConfig = {
	aiSlopDetection: RuleBase;
	languageRequirement: RuleBase & { language: string };
	minMergedPrs: RuleBase & { count: number };
	accountAge: RuleBase & { days: number };
	maxPrsPerDay: RuleBase & { limit: number };
	maxFilesChanged: RuleBase & { limit: number };
	repoActivityMinimum: RuleBase & { minRepos: number };
	requireProfileReadme: RuleBase;
	cryptoAddressDetection: RuleBase;
	vouchedUsersOnly: RuleBase;
	aiHoneypot: RuleBase;
	/** Auto-whitelist users who have global vouch records (from any Tripwire maintainer). */
	autoWhitelistGlobalVouches: { enabled: boolean; minVouches: number };
	contentScope: ContentScope;
	repoFiles: RepoFilesConfig;
};

/** Keys of RuleConfig that represent actual rules (i.e. have RuleBase shape). */
export const RULE_KEYS = [
	"aiSlopDetection",
	"languageRequirement",
	"minMergedPrs",
	"accountAge",
	"maxPrsPerDay",
	"maxFilesChanged",
	"repoActivityMinimum",
	"requireProfileReadme",
	"cryptoAddressDetection",
	"vouchedUsersOnly",
	"aiHoneypot",
] as const;
export type RuleKey = (typeof RULE_KEYS)[number];

export const DEFAULT_RULE_CONFIG: RuleConfig = {
	aiSlopDetection: { enabled: false, action: "block" },
	languageRequirement: { enabled: false, action: "block", language: "English" },
	minMergedPrs: { enabled: false, action: "block", count: 15 },
	accountAge: { enabled: false, action: "block", days: 30 },
	maxPrsPerDay: { enabled: false, action: "block", limit: 5 },
	maxFilesChanged: { enabled: false, action: "block", limit: 20 },
	repoActivityMinimum: { enabled: false, action: "block", minRepos: 3 },
	requireProfileReadme: { enabled: false, action: "block" },
	cryptoAddressDetection: { enabled: false, action: "block" },
	vouchedUsersOnly: { enabled: false, action: "block" },
	aiHoneypot: { enabled: false, action: "block" },
	autoWhitelistGlobalVouches: { enabled: false, minVouches: 1 },
	contentScope: { pullRequests: true, issues: true, comments: true },
	repoFiles: {
		rulesMd: { autoSync: false, customContent: "" },
		prTemplate: {
			autoSync: false,
			honeypotEnabled: false,
			honeypotPhrases: [],
			customContent: "",
		},
		agentsMd: {
			autoSync: false,
			honeypotEnabled: false,
			honeypotPhrases: [],
			customContent: "",
		},
	},
};

/**
 * Rule configuration per repository. Stores all rule settings as JSONB
 * so configs can be exported/imported as JSON trivially.
 */
export const ruleConfigs = pgTable("rule_configs", {
	id: uuid("id").primaryKey().defaultRandom(),
	repoId: uuid("repo_id")
		.notNull()
		.unique()
		.references(() => repositories.id, { onDelete: "cascade" }),
	config: jsonb("config").$type<RuleConfig>().notNull().default(DEFAULT_RULE_CONFIG),
	createdAt: timestamp("created_at").notNull().defaultNow(),
	updatedAt: timestamp("updated_at").notNull().defaultNow(),
});
