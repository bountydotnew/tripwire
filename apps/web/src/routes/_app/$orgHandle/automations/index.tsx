import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { parseAsStringEnum, useQueryState } from "nuqs";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";
import { templates } from "#/components/automations/templates";
import type { WorkflowTemplate } from "#/components/automations/templates";
import type { Node, Edge } from "@xyflow/react";

export const Route = createFileRoute("/_app/$orgHandle/automations/")({
	component: AutomationsPage,
});


// ─── Page ───────────────────────────────────────────────────────

function AutomationsPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { orgHandle } = Route.useParams();
	const { repo } = useWorkspace();

	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringEnum(["workflows", "reports"] as const).withDefault("workflows"),
	);

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

	const createWf = useMutation(trpc.workflows.create.mutationOptions());
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
					setIsCreating(false);
					setNewName("");
					if (repo?.id) queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }) });
					navigate({ to: `/${orgHandle}/automations/${wf.id}` });
				},
			},
		);
	};

	const handlePreviewTemplate = (template: WorkflowTemplate) => {
		navigate({ to: `/${orgHandle}/automations/preview?template=${template.id}` });
	};

	const handleDelete = (id: string) => {
		deleteWf.mutate(
			{ id },
			{
				onSuccess: () => {
					if (repo?.id) queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }) });
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
		if (repo?.id) queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }) });
		setTimeout(() => setSaved(false), 2000);
	};

	const handleDiscardToggles = () => {
		setPendingToggles(new Map());
	};

	// Resolve displayed enabled state (pending overrides server)
	const getEffectiveEnabled = (wf: { id: string; enabled: boolean }) =>
		pendingToggles.has(wf.id) ? pendingToggles.get(wf.id)! : wf.enabled;

	// List + Reports view
	return (
		<div className="p-6 max-w-3xl mx-auto">
			<div className="flex items-center justify-between mb-4">
				<div>
					<h2 className="text-lg font-medium text-tw-text-primary">Automations</h2>
					<p className="text-[13px] text-tw-text-secondary mt-0.5">
						Visual workflows that process contributors through rule chains, logic gates, and actions.
					</p>
				</div>
			</div>

			{/* Tabs */}
			<div className="bg-tw-card rounded-[10px] p-1 flex items-center gap-1 mb-5 self-start w-fit">
				{([
					["workflows", "Workflows"] as const,
					["reports", "Reports"] as const,
				]).map(([t, label]) => (
					<button
						key={t}
						type="button"
						onClick={() => setTab(t)}
						className={`flex items-center justify-center h-7 px-3 rounded-[6px] text-[12px] font-medium transition-colors cursor-pointer ${
							tab === t
								? "bg-[#FAFAFA1A] text-[#EEEEEE]"
								: "text-[#9F9FA9] hover:text-[#EEEEEE]"
						}`}
					>
						{label}
					</button>
				))}
			</div>

			{tab === "reports" && <ReportsPanel repoId={repo?.id} />}

			{tab === "workflows" && <>
			<div className="flex items-center justify-end mb-4">
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
						onClick={() => handleCreate()}
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
								onClick={() => handlePreviewTemplate(t)}
								disabled={createWf.isPending}
								className="flex flex-col items-start gap-2 p-4 rounded-xl bg-tw-card border border-tw-border hover:border-[#FFFFFF1A] transition-all text-left group disabled:opacity-50"
							>
								<span className="text-[13px] font-medium text-tw-text-primary truncate">{t.name}</span>
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
								onClick={() => navigate({ to: `/${orgHandle}/automations/${wf.id}` })}
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
			</>}
		</div>
	);
}

// ─── Reports Panel ─────────────────────────────────────────────

function ReportsPanel({ repoId }: { repoId?: string }) {
	const trpc = useTRPC();
	const [kind, setKind] = useState<"user" | "pr" | "issue">("user");
	const [username, setUsername] = useState("");
	const [ref, setRef] = useState("");
	const runReport = useMutation(trpc.workflows.runReport.mutationOptions());

	const handleRun = () => {
		if (!repoId || !username.trim()) return;
		runReport.mutate({
			repoId,
			username: username.trim(),
			kind,
			ref: ref.trim() || undefined,
		});
	};

	const report = runReport.data;
	const userData = report?.userData;

	const placeholders: Record<string, string> = {
		user: "GitHub username...",
		pr: "PR author username...",
		issue: "Issue author username...",
	};

	return (
		<div className="flex flex-col gap-4">
			<div>
				<p className="text-[13px] text-tw-text-secondary mb-3">
					Run a user, PR, or issue through your active workflows.
				</p>

				{/* Kind selector */}
				<div className="bg-tw-card rounded-[10px] p-1 flex items-center gap-1 mb-3 w-fit">
					{([
						["user", "User"] as const,
						["pr", "Pull Request"] as const,
						["issue", "Issue"] as const,
					]).map(([k, label]) => (
						<button
							key={k}
							type="button"
							onClick={() => setKind(k)}
							className={`flex items-center justify-center h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors cursor-pointer ${
								kind === k
									? "bg-[#FAFAFA1A] text-[#EEEEEE]"
									: "text-[#9F9FA9] hover:text-[#EEEEEE]"
							}`}
						>
							{label}
						</button>
					))}
				</div>

				<div className="flex gap-2">
					{/* Username input */}
					<div className="flex items-center gap-2 h-9 flex-1 rounded-[10px] bg-tw-card px-2.5">
						<svg width="13" height="13" viewBox="0 0 16 16" fill="#6E6E6E">
							<path d="M8 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm5 7a5 5 0 0 0-10 0h10Z" />
						</svg>
						<input
							type="text"
							placeholder={placeholders[kind]}
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							onKeyDown={(e) => e.key === "Enter" && handleRun()}
							className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder:text-[#6E6E6E]"
						/>
					</div>

					{/* Ref input (PR/issue number) */}
					{kind !== "user" && (
						<div className="flex items-center gap-1.5 h-9 w-28 rounded-[10px] bg-tw-card px-2.5">
							<span className="text-[#6E6E6E] text-[13px]">#</span>
							<input
								type="text"
								placeholder="Number"
								value={ref}
								onChange={(e) => setRef(e.target.value.replace(/\D/g, ""))}
								onKeyDown={(e) => e.key === "Enter" && handleRun()}
								className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder:text-[#6E6E6E] w-full"
							/>
						</div>
					)}

					<button
						type="button"
						onClick={handleRun}
						disabled={runReport.isPending || !username.trim()}
						className="flex items-center gap-1.5 h-9 px-4 rounded-[10px] bg-[#363639] hover:bg-[#404044] text-[13px] font-medium text-tw-text-primary transition-colors disabled:opacity-50 shrink-0"
					>
						{runReport.isPending ? "Running..." : "Run"}
					</button>
				</div>
			</div>

			{runReport.isError && (
				<div className="text-[13px] text-tw-error">
					{runReport.error?.message ?? "Failed to run report"}
				</div>
			)}

			{report && (
				<div className="flex flex-col gap-3">
					{/* User card */}
					{userData && (
						<div className="rounded-xl bg-tw-card p-1">
							<div className="rounded-[10px] bg-tw-inner p-3 flex items-center gap-3">
								<img src={userData.user.avatarUrl} alt="" className="size-10 rounded-full" />
								<div className="flex-1 min-w-0">
									<p className="text-[14px] font-medium text-tw-text-primary">
										{userData.user.name ?? userData.user.login}
									</p>
									<p className="text-[12px] text-tw-text-muted">@{userData.user.login}</p>
								</div>
								<div
									className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[13px] font-medium tabular-nums ${
										(userData.data.score as number) >= 70 ? "text-tw-success bg-tw-success/10"
										: (userData.data.score as number) >= 40 ? "text-tw-warning bg-tw-warning/10"
										: "text-tw-error bg-tw-error/10"
									}`}
								>
									{userData.data.score as number}/100
								</div>
							</div>
						</div>
					)}

					{/* Content card (PR/issue) */}
					{report.contentMeta && (
						<div className="rounded-xl bg-tw-card p-1">
							<div className="rounded-[10px] bg-tw-inner p-3 flex items-start gap-3">
								<span className={`mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider ${
									report.contentMeta.state === "merged" ? "bg-[#A371F7]/10 text-[#A371F7]"
									: report.contentMeta.state === "open" ? "bg-tw-success/10 text-tw-success"
									: "bg-tw-error/10 text-tw-error"
								}`}>
									{report.contentMeta.state}
								</span>
								<div className="flex-1 min-w-0">
									<p className="text-[13px] font-medium text-tw-text-primary">
										{report.contentMeta.title}
									</p>
									<p className="text-[11px] text-tw-text-muted mt-0.5">
										#{report.contentMeta.number}
									</p>
								</div>
								<a
									href={report.contentMeta.url}
									target="_blank"
									rel="noopener noreferrer"
									className="text-[11px] text-tw-accent hover:underline shrink-0"
								>
									View
								</a>
							</div>
							{report.contentText && (
								<div className="px-3 pb-2 pt-1">
									<p className="text-[11px] text-tw-text-muted leading-relaxed line-clamp-3">
										{report.contentText}
									</p>
								</div>
							)}
						</div>
					)}

					{/* No active workflows */}
					{report.results.length === 0 && (
						<div className="rounded-xl bg-tw-card p-4 text-center">
							<p className="text-[13px] text-tw-text-muted">No active workflows to run against.</p>
							<p className="text-[11px] text-tw-text-tertiary mt-1">Enable workflows in the Workflows tab first.</p>
						</div>
					)}

					{/* Per-workflow results */}
					{report.results.map((r) => {
						const resultColor =
							r.result === "blocked" ? "bg-tw-error/10 border-tw-error/20" :
							r.result === "allowed" ? "bg-tw-success/10 border-tw-success/20" :
							"bg-[#FFFFFF06] border-tw-border";
						const resultLabel =
							r.result === "blocked" ? "BLOCKED" :
							r.result === "allowed" ? "ALLOWED" :
							"NO ACTION";
						const resultTextColor =
							r.result === "blocked" ? "text-tw-error" :
							r.result === "allowed" ? "text-tw-success" :
							"text-tw-text-muted";

						return (
							<div key={r.workflowId} className="rounded-xl bg-tw-card p-1 flex flex-col gap-0.5">
								{/* Workflow header */}
								<div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
									<div className="flex items-center gap-2 min-w-0">
										<svg width="14" height="14" viewBox="0 0 16 16" fill="#9F9FA9">
											<path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
										</svg>
										<span className="text-[13px] font-medium text-tw-text-primary truncate">{r.workflowName}</span>
										<span className="text-[11px] text-tw-text-muted">{r.outcomes.length} nodes</span>
									</div>
									<span className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${resultColor} ${resultTextColor}`}>
										{resultLabel}
									</span>
								</div>

								{/* Node trace */}
								<div className="flex flex-col gap-0.5 px-1 pb-1">
									{r.outcomes.map((o) => {
										const dotClass =
											o.status === "pass" ? "bg-tw-success" :
											o.status === "fail" ? "bg-tw-error" :
											o.status === "executed" ? "bg-tw-accent" :
											"bg-tw-text-muted";
										return (
											<div key={o.nodeId} className="rounded-[10px] bg-tw-inner px-2.5 py-1.5 flex items-center gap-2.5">
												<span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotClass}`} />
												<span className="text-[12px] text-tw-text-secondary flex-1 truncate">
													{o.label}
												</span>
												<span className="text-[11px] text-tw-text-muted truncate max-w-[200px]">
													{o.detail}
												</span>
											</div>
										);
									})}
								</div>

								{/* Actions taken */}
								{r.actions.length > 0 && (
									<div className="px-3 pb-2 flex flex-wrap gap-1.5">
										{r.actions.map((a, i) => (
											<span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-[#FAFAFA08] text-tw-text-muted">
												{a}
											</span>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
