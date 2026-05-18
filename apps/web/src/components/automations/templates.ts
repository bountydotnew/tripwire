import type { Node, Edge } from "@xyflow/react";

export interface WorkflowTemplate {
	id: string;
	name: string;
	description: string;
	/** Design system accent color for the template card indicator */
	accent: string;
	nodes: Node[];
	edges: Edge[];
}

const edgeStyle = (color = "#9F9FA966") => ({ stroke: color, strokeWidth: 2 });

export const templates: WorkflowTemplate[] = [
	{
		id: "contributor_screening",
		name: "Contributor Screening",
		description: "Validate account age and merge history before allowing contributions.",
		accent: "#D4A843", // rule color
		nodes: [
			{ id: "trigger_1", type: "trigger", position: { x: 300, y: 50 }, data: { trigger: "pr_opened" } },
			{ id: "transform_1", type: "transform", position: { x: 270, y: 200 }, data: { transform: "fetch_github_user" } },
			{ id: "rule_1", type: "rule", position: { x: 100, y: 370 }, data: { rule: "accountAge", params: { days: 30 } } },
			{ id: "rule_2", type: "rule", position: { x: 420, y: 370 }, data: { rule: "minMergedPrs", params: { count: 5 } } },
			{ id: "logic_1", type: "logic", position: { x: 270, y: 540 }, data: { gate: "AND" } },
			{ id: "action_1", type: "action", position: { x: 180, y: 680 }, data: { action: "log", message: "Trusted contributor" } },
			{ id: "action_2", type: "action", position: { x: 420, y: 680 }, data: { action: "block", message: "Account does not meet requirements" } },
		],
		edges: [
			{ id: "e1", source: "trigger_1", target: "transform_1", animated: true, style: edgeStyle() },
			{ id: "e2", source: "transform_1", target: "rule_1", animated: true, style: edgeStyle() },
			{ id: "e3", source: "transform_1", target: "rule_2", animated: true, style: edgeStyle() },
			{ id: "e4", source: "rule_1", sourceHandle: "pass", target: "logic_1", targetHandle: "a", animated: true, style: edgeStyle("#67E19F66") },
			{ id: "e5", source: "rule_2", sourceHandle: "pass", target: "logic_1", targetHandle: "b", animated: true, style: edgeStyle("#67E19F66") },
			{ id: "e6", source: "logic_1", target: "action_1", animated: true, style: edgeStyle() },
			{ id: "e7", source: "rule_1", sourceHandle: "fail", target: "action_2", animated: true, style: edgeStyle("#F56D5D66") },
		],
	},
	{
		id: "spam_detector",
		name: "Content Filter",
		description: "Block AI-generated text and crypto address spam on PRs and issues.",
		accent: "#F56D5D", // error/block color
		nodes: [
			{ id: "trigger_1", type: "trigger", position: { x: 300, y: 50 }, data: { trigger: "pr_opened" } },
			{ id: "rule_1", type: "rule", position: { x: 150, y: 220 }, data: { rule: "aiSlopDetection" } },
			{ id: "rule_2", type: "rule", position: { x: 430, y: 220 }, data: { rule: "cryptoAddressDetection" } },
			{ id: "logic_1", type: "logic", position: { x: 300, y: 390 }, data: { gate: "OR" } },
			{ id: "action_1", type: "action", position: { x: 200, y: 540 }, data: { action: "block", message: "Spam detected" } },
			{ id: "action_2", type: "action", position: { x: 420, y: 540 }, data: { action: "add_to_blacklist" } },
		],
		edges: [
			{ id: "e1", source: "trigger_1", target: "rule_1", animated: true, style: edgeStyle() },
			{ id: "e2", source: "trigger_1", target: "rule_2", animated: true, style: edgeStyle() },
			{ id: "e3", source: "rule_1", sourceHandle: "fail", target: "logic_1", targetHandle: "a", animated: true, style: edgeStyle("#F56D5D66") },
			{ id: "e4", source: "rule_2", sourceHandle: "fail", target: "logic_1", targetHandle: "b", animated: true, style: edgeStyle("#F56D5D66") },
			{ id: "e5", source: "logic_1", target: "action_1", animated: true, style: edgeStyle() },
			{ id: "e6", source: "logic_1", target: "action_2", animated: true, style: edgeStyle() },
		],
	},
	{
		id: "repo_history_scan",
		name: "History Scan",
		description: "Score past contributors and flag low-trust accounts for review.",
		accent: "#B07FDB", // condition color
		nodes: [
			{ id: "trigger_1", type: "trigger", position: { x: 300, y: 50 }, data: { trigger: "repo_scan" } },
			{ id: "transform_1", type: "transform", position: { x: 300, y: 200 }, data: { transform: "fetch_github_user" } },
			{ id: "condition_1", type: "condition", position: { x: 300, y: 370 }, data: { field: "score", operator: "<", value: 30 } },
			{ id: "action_1", type: "action", position: { x: 150, y: 540 }, data: { action: "add_to_blacklist" } },
			{ id: "action_2", type: "action", position: { x: 450, y: 540 }, data: { action: "log", message: "Flagged for review" } },
		],
		edges: [
			{ id: "e1", source: "trigger_1", target: "transform_1", animated: true, style: edgeStyle() },
			{ id: "e2", source: "transform_1", target: "condition_1", animated: true, style: edgeStyle() },
			{ id: "e3", source: "condition_1", sourceHandle: "true", target: "action_1", animated: true, style: edgeStyle("#F56D5D66") },
			{ id: "e4", source: "condition_1", sourceHandle: "false", target: "action_2", animated: true, style: edgeStyle("#67E19F66") },
		],
	},
	{
		id: "first_time_contributor",
		name: "First Interaction Gate",
		description: "Require profile completeness and repo activity from new contributors.",
		accent: "#34A6FF", // trigger/accent color
		nodes: [
			{ id: "trigger_1", type: "trigger", position: { x: 300, y: 50 }, data: { trigger: "contributor_first_interaction" } },
			{ id: "transform_1", type: "transform", position: { x: 300, y: 200 }, data: { transform: "fetch_github_user" } },
			{ id: "rule_1", type: "rule", position: { x: 150, y: 370 }, data: { rule: "requireProfileReadme" } },
			{ id: "rule_2", type: "rule", position: { x: 450, y: 370 }, data: { rule: "repoActivityMinimum", params: { minRepos: 3 } } },
			{ id: "action_1", type: "action", position: { x: 150, y: 540 }, data: { action: "label", label: "needs-review" } },
			{ id: "action_2", type: "action", position: { x: 450, y: 540 }, data: { action: "warn", message: "Please complete your GitHub profile" } },
		],
		edges: [
			{ id: "e1", source: "trigger_1", target: "transform_1", animated: true, style: edgeStyle() },
			{ id: "e2", source: "transform_1", target: "rule_1", animated: true, style: edgeStyle() },
			{ id: "e3", source: "transform_1", target: "rule_2", animated: true, style: edgeStyle() },
			{ id: "e4", source: "rule_1", sourceHandle: "pass", target: "action_1", animated: true, style: edgeStyle("#67E19F66") },
			{ id: "e5", source: "rule_2", sourceHandle: "fail", target: "action_2", animated: true, style: edgeStyle("#F56D5D66") },
		],
	},
];
