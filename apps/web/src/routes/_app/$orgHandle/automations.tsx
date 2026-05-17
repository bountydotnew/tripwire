import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";
import { WorkflowEditor } from "#/components/automations/workflow-editor";
import type { Node, Edge } from "@xyflow/react";

export const Route = createFileRoute("/_app/$orgHandle/automations")({
	component: AutomationsPage,
});

// ─── Templates ─────────────────────────────────────────────────

interface WorkflowTemplate {
	id: string;
	name: string;
	description: string;
	icon: string;
	nodes: Node[];
	edges: Edge[];
}

const edgeStyle = (color = "#9F9FA966") => ({ stroke: color, strokeWidth: 2 });

const templates: WorkflowTemplate[] = [
	{
		id: "contributor_screening",
		name: "Contributor Screening",
		description: "Check account age and PR history, block or allow based on both passing.",
		icon: "🛡",
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
		name: "Spam & AI Slop Filter",
		description: "Detect AI-generated content and crypto address spam, auto-block offenders.",
		icon: "🤖",
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
		name: "Repo History Scan",
		description: "Scan your repo's past contributors to catch repeat offenders before they strike again.",
		icon: "🔍",
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
		name: "First-Time Contributor Gate",
		description: "Extra scrutiny for first interactions — check profile, require vouches, or auto-label.",
		icon: "👋",
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

// ─── Page ───────────────────────────────────────────────────────

function AutomationsPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { repo } = useWorkspace();

	const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
	const [isCreating, setIsCreating] = useState(false);
	const [newName, setNewName] = useState("");

	// Pending toggle changes (not yet saved)
	const [pendingToggles, setPendingToggles] = useState<Map<string, boolean>>(new Map());
	const [saving, setSaving] = useState(false);
	const [saved, setSaved] = useState(false);
	const dirty = pendingToggles.size > 0;

	// Fetch workflows for this repo
	const workflowsQuery = useQuery(
		trpc.workflows.list.queryOptions(
			{ repoId: repo?.id ?? "" },
			{ enabled: !!repo?.id },
		),
	);
	const wfList = workflowsQuery.data ?? [];

	// Fetch active workflow
	const activeWfQuery = useQuery(
		trpc.workflows.get.queryOptions(
			{ id: activeWorkflowId ?? "" },
			{ enabled: !!activeWorkflowId },
		),
	);

	const createWf = useMutation(trpc.workflows.create.mutationOptions());
	const updateWf = useMutation(trpc.workflows.update.mutationOptions());
	const deleteWf = useMutation(trpc.workflows.delete.mutationOptions());
	const toggleWf = useMutation(trpc.workflows.update.mutationOptions());

	const handleCreate = (definition?: { nodes: Node[]; edges: Edge[] }) => {
		if (!repo?.id || !newName.trim()) return;
		createWf.mutate(
			{
				repoId: repo.id,
				name: newName.trim(),
				definition: definition ?? { nodes: [], edges: [] },
			},
			{
				onSuccess: (wf) => {
					setActiveWorkflowId(wf.id);
					setIsCreating(false);
					setNewName("");
					queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo!.id }) });
				},
			},
		);
	};

	const handleCreateFromTemplate = (template: WorkflowTemplate) => {
		if (!repo?.id) return;
		createWf.mutate(
			{
				repoId: repo.id,
				name: template.name,
				definition: { nodes: template.nodes, edges: template.edges },
			},
			{
				onSuccess: (wf) => {
					setActiveWorkflowId(wf.id);
					queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo!.id }) });
				},
			},
		);
	};

	const handleSave = (nodes: Node[], edges: Edge[]) => {
		if (!activeWorkflowId) return;
		updateWf.mutate(
			{
				id: activeWorkflowId,
				definition: {
					nodes: nodes.map((n) => ({
						id: n.id,
						type: n.type as string,
						position: n.position,
						data: n.data as Record<string, unknown>,
					})),
					edges: edges.map((e) => ({
						id: e.id,
						source: e.source,
						target: e.target,
						sourceHandle: e.sourceHandle,
						targetHandle: e.targetHandle,
						label: typeof e.label === "string" ? e.label : undefined,
						animated: e.animated,
					})),
				},
			},
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo!.id }) });
				},
			},
		);
	};

	const handleDelete = (id: string) => {
		if (activeWorkflowId === id) setActiveWorkflowId(null);
		deleteWf.mutate(
			{ id },
			{
				onSuccess: () => {
					queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo!.id }) });
				},
			},
		);
	};

	const handleToggle = (id: string, enabled: boolean) => {
		setPendingToggles((prev) => {
			const next = new Map(prev);
			// If toggling back to original, remove from pending
			const original = wfList.find((w) => w.id === id);
			if (original && original.enabled === enabled) {
				next.delete(id);
			} else {
				next.set(id, enabled);
			}
			return next;
		});
	};

	const handleSaveToggles = async () => {
		setSaving(true);
		const promises = Array.from(pendingToggles.entries()).map(([id, enabled]) =>
			toggleWf.mutateAsync({ id, enabled }),
		);
		await Promise.all(promises);
		setPendingToggles(new Map());
		setSaving(false);
		setSaved(true);
		queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo!.id }) });
		setTimeout(() => setSaved(false), 2000);
	};

	const handleDiscardToggles = () => {
		setPendingToggles(new Map());
	};

	// Resolve displayed enabled state (pending overrides server)
	const getEffectiveEnabled = (wf: { id: string; enabled: boolean }) =>
		pendingToggles.has(wf.id) ? pendingToggles.get(wf.id)! : wf.enabled;

	// No repo selected
	if (!repo) {
		return (
			<div className="flex items-center justify-center h-full">
				<p className="text-tw-text-secondary text-sm">Select a repository to manage automations.</p>
			</div>
		);
	}

	// Editing a workflow
	if (activeWorkflowId && activeWfQuery.data) {
		const wf = activeWfQuery.data;
		const def = wf.definition;
		return (
			<div className="h-full flex flex-col">
				<div className="flex items-center gap-3 px-4 py-3 border-b border-tw-border shrink-0">
					<button
						type="button"
						onClick={() => setActiveWorkflowId(null)}
						className="flex items-center justify-center size-7 rounded-lg hover:bg-tw-hover transition-colors"
					>
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
							<path d="M9 3L5 7L9 11" stroke="#9F9FA9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
						</svg>
					</button>
					<div className="flex flex-col min-w-0">
						<span className="text-[14px] font-medium text-tw-text-primary truncate">{wf.name}</span>
						{wf.description && (
							<span className="text-[11px] text-tw-text-muted truncate">{wf.description}</span>
						)}
					</div>
					<div className="ml-auto flex items-center gap-2">
						<span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${wf.enabled ? "bg-tw-success/10 text-tw-success" : "bg-[#FFFFFF08] text-tw-text-muted"}`}>
							{wf.enabled ? "Active" : "Draft"}
						</span>
					</div>
				</div>
				<div className="flex-1 min-h-0">
					<WorkflowEditor
						initialNodes={def.nodes as Node[]}
						initialEdges={def.edges as Edge[]}
						onSave={handleSave}
						repoId={repo?.id}
					/>
				</div>
			</div>
		);
	}

	// Workflow list
	return (
		<div className="p-6 max-w-3xl mx-auto">
			<div className="flex items-center justify-between mb-6">
				<div>
					<h2 className="text-lg font-medium text-tw-text-primary">Automations</h2>
					<p className="text-[13px] text-tw-text-secondary mt-0.5">
						Visual workflows that process contributors through rule chains, logic gates, and actions.
					</p>
				</div>
				{!isCreating && (
					<button
						type="button"
						onClick={() => setIsCreating(true)}
						className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-tw-accent text-white text-[13px] font-medium hover:opacity-90 transition-opacity"
					>
						<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
							<path d="M7 3v8M3 7h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
						</svg>
						New Workflow
					</button>
				)}
			</div>

			{isCreating && (
				<div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-tw-card border border-tw-border">
					<input
						type="text"
						placeholder="Workflow name..."
						value={newName}
						onChange={(e) => setNewName(e.target.value)}
						onKeyDown={(e) => e.key === "Enter" && handleCreate()}
						autoFocus
						className="flex-1 h-8 bg-tw-inner rounded-lg px-2.5 text-[13px] text-tw-text-primary placeholder:text-tw-text-tertiary outline-none"
					/>
					<button
						type="button"
						onClick={handleCreate}
						disabled={!newName.trim() || createWf.isPending}
						className="h-8 px-3 rounded-lg bg-tw-accent text-white text-[13px] font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
					>
						{createWf.isPending ? "..." : "Create"}
					</button>
					<button
						type="button"
						onClick={() => { setIsCreating(false); setNewName(""); }}
						className="h-8 px-2 rounded-lg text-tw-text-muted hover:text-tw-text-secondary hover:bg-tw-hover transition-colors text-[13px]"
					>
						Cancel
					</button>
				</div>
			)}

			{workflowsQuery.isPending ? (
				<div className="flex items-center justify-center py-16">
					<span className="text-tw-text-muted text-sm">Loading...</span>
				</div>
			) : wfList.length === 0 ? (
				<div>
					<div className="text-center mb-6">
						<p className="text-tw-text-secondary text-sm font-medium mb-1">No workflows yet</p>
						<p className="text-tw-text-muted text-xs">
							Start from scratch or pick a template below.
						</p>
					</div>

					<div className="grid grid-cols-2 gap-3">
						{/* Blank workflow card */}
						<button
							type="button"
							onClick={() => setIsCreating(true)}
							className="flex flex-col items-center justify-center gap-2 p-5 rounded-xl border border-dashed border-[#FFFFFF1A] hover:border-tw-accent/40 hover:bg-[#FFFFFF04] transition-all text-center group"
						>
							<div className="flex items-center justify-center size-10 rounded-lg bg-[#FFFFFF08] group-hover:bg-tw-accent/10 transition-colors">
								<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
									<path d="M9 4v10M4 9h10" stroke="#9F9FA9" strokeWidth="1.5" strokeLinecap="round" className="group-hover:stroke-tw-accent transition-colors" />
								</svg>
							</div>
							<div>
								<p className="text-[13px] font-medium text-tw-text-primary">Blank Workflow</p>
								<p className="text-[11px] text-tw-text-muted mt-0.5">Start with an empty canvas</p>
							</div>
						</button>

						{/* Template cards */}
						{templates.map((t) => (
							<button
								key={t.id}
								type="button"
								onClick={() => handleCreateFromTemplate(t)}
								disabled={createWf.isPending}
								className="flex flex-col items-start gap-2 p-4 rounded-xl bg-tw-card border border-tw-border hover:border-[#FFFFFF1A] transition-all text-left group disabled:opacity-50"
							>
								<div className="flex items-center gap-2.5 w-full">
									<span className="text-[18px] leading-none">{t.icon}</span>
									<span className="text-[13px] font-medium text-tw-text-primary truncate">{t.name}</span>
								</div>
								<p className="text-[11px] text-tw-text-muted leading-relaxed">{t.description}</p>
								<span className="text-[11px] text-tw-text-tertiary mt-auto">
									{t.nodes.length} nodes · {t.edges.length} connections
								</span>
							</button>
						))}
					</div>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{wfList.map((wf) => {
						const nodeCount = (wf.definition as { nodes: unknown[] }).nodes?.length ?? 0;
						const isEnabled = getEffectiveEnabled(wf);
						const isPending = pendingToggles.has(wf.id);
						return (
							<div
								key={wf.id}
								className={`group flex items-center gap-3 p-3 rounded-xl bg-tw-card border transition-colors cursor-pointer ${
									isPending ? "border-tw-accent/30" : "border-tw-border hover:border-[#FFFFFF1A]"
								}`}
								onClick={() => setActiveWorkflowId(wf.id)}
							>
								<div className="flex items-center justify-center size-9 rounded-lg bg-[#FFFFFF08] shrink-0">
									<svg width="16" height="16" viewBox="0 0 16 16" fill="#9F9FA9">
										<path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
									</svg>
								</div>
								<div className="flex flex-col min-w-0 flex-1">
									<span className="text-[13px] font-medium text-tw-text-primary truncate">{wf.name}</span>
									<span className="text-[11px] text-tw-text-muted">
										{nodeCount} node{nodeCount !== 1 ? "s" : ""} · Updated {new Date(wf.updatedAt).toLocaleDateString()}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${isEnabled ? "bg-tw-success/10 text-tw-success" : "bg-[#FFFFFF08] text-tw-text-muted"}`}>
										{isEnabled ? "Active" : "Draft"}
									</span>
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); handleToggle(wf.id, !isEnabled); }}
										className={`w-9 h-[20px] relative shrink-0 rounded-[10px] transition-colors border-none ${isEnabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"}`}
									>
										<div className={`w-4 h-4 absolute top-0.5 rounded-full transition-all ${isEnabled ? "right-0.5 bg-white" : "left-0.5 bg-[#FFFFFF59]"}`} />
									</button>
									<button
										type="button"
										onClick={(e) => { e.stopPropagation(); handleDelete(wf.id); }}
										className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-7 rounded-lg hover:bg-[#F56D5D1A] transition-all"
									>
										<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
											<path d="M9 3L3 9M3 3L9 9" stroke="#F56D5D" strokeWidth="1.5" strokeLinecap="round" />
										</svg>
									</button>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{/* Save bar for pending toggle changes */}
			<div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4">
				<AnimatePresence initial={false}>
					{(dirty || saving || saved) && (
						<motion.div
							key="save-shell"
							initial={{ opacity: 0, y: 12, scale: 0.98 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 10, scale: 0.98 }}
							transition={{ type: "spring", stiffness: 360, damping: 30, mass: 0.82 }}
							className="pointer-events-auto"
						>
							<div
								className="rounded-2xl bg-tw-card p-1.5"
								style={{ boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a" }}
							>
								<AnimatePresence initial={false} mode="popLayout">
									{saving ? (
										<motion.div
											key="saving"
											initial={{ opacity: 0.92 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="flex h-9 items-center justify-center px-4"
										>
											<motion.span
												className="size-3 rounded-full border border-tw-text-secondary border-t-transparent"
												animate={{ rotate: 360 }}
												transition={{ duration: 0.8, ease: "linear", repeat: Infinity }}
											/>
										</motion.div>
									) : dirty ? (
										<motion.div
											key="dirty"
											initial={{ opacity: 0.92 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="flex items-center gap-1.5"
										>
											<div className="flex h-9 flex-1 items-center px-2.5">
												<span className="text-[14px] text-tw-text-secondary">
													{pendingToggles.size} workflow{pendingToggles.size === 1 ? "" : "s"} changed
												</span>
											</div>
											<div className="flex items-center gap-1">
												<button
													type="button"
													onClick={handleDiscardToggles}
													className="flex size-9 items-center justify-center rounded-[10px] text-tw-text-tertiary hover:bg-tw-hover hover:text-tw-text-secondary transition-colors"
												>
													<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
														<path d="M7.5 2.5L2.5 7.5M2.5 2.5L7.5 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
													</svg>
												</button>
												<button
													type="button"
													onClick={handleSaveToggles}
													className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[#363639] px-3 hover:bg-[#404044] transition-colors"
												>
													<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-tw-text-secondary">
														<path d="M2.2 6.2 4.75 8.45 9.8 3.55" stroke="currentColor" strokeWidth="1.55" strokeLinecap="round" strokeLinejoin="round" />
													</svg>
													<span className="text-[13px] leading-none text-tw-text-primary">Save</span>
												</button>
											</div>
										</motion.div>
									) : saved ? (
										<motion.div
											key="saved"
											initial={{ opacity: 0 }}
											animate={{ opacity: 1 }}
											exit={{ opacity: 0 }}
											className="flex h-9 items-center gap-2 px-3"
										>
											<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-tw-text-secondary">
												<path d="M2.25 6.35 4.8 8.65 9.75 3.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
											</svg>
											<span className="text-[14px] text-tw-text-primary">Saved</span>
										</motion.div>
									) : null}
								</AnimatePresence>
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}
