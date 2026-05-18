import {
	boolean,
	index,
	jsonb,
	pgTable,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";
import { repositories } from "./installations";
export type WorkflowTrigger =
	| "pr_opened"
	| "pr_edited"
	| "issue_opened"
	| "issue_edited"
	| "comment_created"
	| "contributor_first_interaction"
	| "schedule_daily"
	| "schedule_weekly"
	| "manual"
	| "repo_scan"; // scan repo history for past offenders

export type WorkflowNodeType =
	| "trigger"
	| "rule"        // existing Tripwire rules (accountAge, minMergedPrs, etc.)
	| "condition"   // custom condition (score > X, username matches, etc.)
	| "logic"       // AND / OR / NOT gates
	| "action"      // block, warn, log, whitelist, blacklist, notify, label
	| "delay"       // wait N minutes/hours/days
	| "transform";  // enrich data, fetch GitHub info, compute score

export type WorkflowActionType =
	| "block"
	| "warn"
	| "log"
	| "close"
	| "label"
	| "comment"
	| "add_to_whitelist"
	| "add_to_blacklist"
	| "remove_from_whitelist"
	| "remove_from_blacklist"
	| "notify_slack"
	| "notify_discord"
	| "send_webhook"
	| "request_review";

export interface WorkflowNode {
	id: string;
	type: WorkflowNodeType;
	position: { x: number; y: number };
	data: Record<string, unknown>;
}

export interface WorkflowEdge {
	id: string;
	source: string;
	target: string;
	sourceHandle?: string | null;
	targetHandle?: string | null;
	label?: string;
	animated?: boolean;
}

export interface WorkflowDefinition {
	nodes: WorkflowNode[];
	edges: WorkflowEdge[];
}
export const workflows = pgTable(
	"workflows",
	{
		id: uuid("id").primaryKey().defaultRandom(),
		repoId: uuid("repo_id")
			.notNull()
			.references(() => repositories.id, { onDelete: "cascade" }),
		name: text("name").notNull(),
		description: text("description"),
		/** The full node graph */
		definition: jsonb("definition").$type<WorkflowDefinition>().notNull(),
		enabled: boolean("enabled").notNull().default(false),
		createdAt: timestamp("created_at").notNull().defaultNow(),
		updatedAt: timestamp("updated_at").notNull().defaultNow(),
	},
	(t) => [
		index("workflows_repo_idx").on(t.repoId),
	],
);
