import { memo, useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, useReactFlow, type NodeProps } from "@xyflow/react";
function NodeShell({
	children,
	color,
	icon,
	label,
	sublabel,
	selected,
}: {
	children?: React.ReactNode;
	color: string;
	icon: React.ReactNode;
	label: string;
	sublabel?: string;
	selected?: boolean;
}) {
	return (
		<div
			className={`rounded-xl bg-tw-card min-w-[200px] max-w-[260px] transition-shadow ${
				selected ? "shadow-[0_0_0_2px_var(--color-tw-accent)]" : ""
			}`}
			style={{ border: `1px solid ${color}22` }}
		>
			<div
				className="flex items-center gap-2 px-3 py-2 border-b"
				style={{ borderColor: `${color}12` }}
			>
				<span style={{ color }} className="shrink-0 opacity-80">{icon}</span>
				<div className="flex flex-col min-w-0">
					<span className="text-[13px] font-medium text-tw-text-primary leading-tight truncate">
						{label}
					</span>
					{sublabel && (
						<span className="text-[11px] text-tw-text-tertiary leading-tight truncate">
							{sublabel}
						</span>
					)}
				</div>
			</div>
			{children && <div className="px-3 py-2">{children}</div>}
		</div>
	);
}

function Param({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex items-center justify-between gap-2 py-0.5">
			<span className="text-[11px] text-tw-text-tertiary">{label}</span>
			<span className="text-[11px] text-tw-text-secondary font-mono bg-tw-inner px-1.5 py-0.5 rounded">
				{value}
			</span>
		</div>
	);
}

/** Editable numeric chip — click to edit, Enter/blur to commit, Escape to cancel. */
function EditableParam({
	label,
	value,
	nodeId,
	paramKey,
	/** If true, writes directly to data[paramKey] instead of data.params[paramKey] */
	directData,
}: {
	label: string;
	value: number;
	nodeId: string;
	paramKey: string;
	directData?: boolean;
}) {
	const { setNodes } = useReactFlow();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState<string>(String(value));
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { setDraft(String(value)); }, [value]);
	useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

	const commit = useCallback(() => {
		const val = Number(draft);
		if (draft !== "" && Number.isFinite(val) && val > 0 && val !== value) {
			setNodes((nodes) =>
				nodes.map((n) => {
					if (n.id !== nodeId) return n;
					if (directData) {
						return { ...n, data: { ...n.data, [paramKey]: Math.floor(val) } };
					}
					const params = { ...((n.data.params as Record<string, unknown>) ?? {}), [paramKey]: Math.floor(val) };
					return { ...n, data: { ...n.data, params } };
				}),
			);
		} else {
			setDraft(value);
		}
		setEditing(false);
	}, [draft, value, nodeId, paramKey, directData, setNodes]);

	return (
		<div className="flex items-center justify-between gap-2 py-0.5">
			<span className="text-[11px] text-tw-text-tertiary">{label}</span>
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					inputMode="numeric"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") { e.preventDefault(); commit(); }
						else if (e.key === "Escape") { e.preventDefault(); setDraft(String(value)); setEditing(false); }
					}}
					onClick={(e) => e.stopPropagation()}
					className="w-14 px-2 py-0.5 rounded-md text-[11px] font-medium bg-tw-surface text-tw-text-primary border border-tw-accent/40 outline-none text-center"
				/>
			) : (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); setDraft(value); setEditing(true); }}
					className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-tw-surface text-tw-text-secondary cursor-pointer hover:bg-tw-hover-light"
					title={`Edit ${label.toLowerCase()}`}
				>
					{value}
				</button>
			)}
		</div>
	);
}

/** Editable text chip — click to edit inline text fields (message, label, url). */
function EditableText({
	label,
	value,
	nodeId,
	fieldKey,
	placeholder,
}: {
	label: string;
	value: string;
	nodeId: string;
	fieldKey: string;
	placeholder?: string;
}) {
	const { setNodes } = useReactFlow();
	const [editing, setEditing] = useState(false);
	const [draft, setDraft] = useState(value);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => { setDraft(value); }, [value]);
	useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);

	const commit = useCallback(() => {
		if (draft !== value) {
			setNodes((nodes) => nodes.map((n) => n.id !== nodeId ? n : { ...n, data: { ...n.data, [fieldKey]: draft } }));
		}
		setEditing(false);
	}, [draft, value, nodeId, fieldKey, setNodes]);

	return (
		<div className="flex items-center justify-between gap-2 py-0.5">
			<span className="text-[11px] text-tw-text-tertiary shrink-0">{label}</span>
			{editing ? (
				<input
					ref={inputRef}
					type="text"
					value={draft}
					onChange={(e) => setDraft(e.target.value)}
					onBlur={commit}
					onKeyDown={(e) => {
						if (e.key === "Enter") { e.preventDefault(); commit(); }
						else if (e.key === "Escape") { e.preventDefault(); setDraft(value); setEditing(false); }
					}}
					onClick={(e) => e.stopPropagation()}
					placeholder={placeholder}
					className="flex-1 min-w-0 px-1.5 py-0.5 rounded-md text-[11px] bg-tw-surface text-tw-text-primary border border-tw-accent/40 outline-none"
				/>
			) : (
				<button
					type="button"
					onClick={(e) => { e.stopPropagation(); setEditing(true); }}
					className="text-[11px] text-tw-text-secondary font-mono bg-tw-inner px-1.5 py-0.5 rounded truncate max-w-[160px] text-left cursor-pointer hover:bg-tw-hover-light"
					title={`Edit ${label.toLowerCase()}`}
				>
					{value || <span className="text-tw-text-tertiary italic">{placeholder ?? "empty"}</span>}
				</button>
			)}
		</div>
	);
}
const icons = {
	trigger: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" />
		</svg>
	),
	rule: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 1a1 1 0 0 1 .7.3l5 5a1 1 0 0 1 0 1.4l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 0 1 0-1.4l5-5A1 1 0 0 1 8 1Z" />
		</svg>
	),
	condition: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v2.382a1.5 1.5 0 0 1-.44 1.06L9.5 9.005v4.245a.75.75 0 0 1-1.2.6l-2-1.5a.75.75 0 0 1-.3-.6V9.005l-3.06-3.063A1.5 1.5 0 0 1 3 4.882V2.5Z" />
		</svg>
	),
	logic: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M6.5 2a.5.5 0 0 0 0 1h.5v3.5a.5.5 0 0 0 .146.354L9.793 9.5l-2.647 2.646A.5.5 0 0 0 7 12.5V14h-.5a.5.5 0 0 0 0 1h3a.5.5 0 0 0 0-1H9v-1.293l2.854-2.853a.5.5 0 0 0 0-.708L9 6.293V3h.5a.5.5 0 0 0 0-1h-3Z" />
		</svg>
	),
	action: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm2.78-9.78a.75.75 0 0 0-1.06 0L7 7.94 6.28 7.22a.75.75 0 0 0-1.06 1.06l1.25 1.25a.75.75 0 0 0 1.06 0l3.25-3.25a.75.75 0 0 0 0-1.06Z" />
		</svg>
	),
	delay: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14Zm-.75-10.5v4c0 .2.08.39.22.53l2 2a.75.75 0 1 0 1.06-1.06L8.75 8.19V4.5a.75.75 0 0 0-1.5 0Z" />
		</svg>
	),
	transform: (
		<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
			<path d="M0 8a4 4 0 0 1 7.465-2H14a.5.5 0 0 1 .354.146l1.5 1.5a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708 0L11 10.207l-1.146 1.147a.5.5 0 0 1-.708 0L8 10.207 7.465 10A4 4 0 0 1 0 8Zm4-2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z" />
		</svg>
	),
};

const colors = {
	trigger: "#34A6FF",
	rule: "#D4A843",
	condition: "#B07FDB",
	logic: "#9F9FA9",
	action: "#67E19F",
	delay: "#E19F67",
	transform: "#67B8E1",
};

// Handle style matching the card border system — no colored circles
const handleBase = "!w-2.5 !h-2.5 !rounded-sm !border !border-tw-border !bg-tw-card";
const triggerLabels: Record<string, string> = {
	pr_opened: "PR Opened",
	pr_edited: "PR Edited",
	issue_opened: "Issue Opened",
	issue_edited: "Issue Edited",
	comment_created: "Comment Created",
	contributor_first_interaction: "First Interaction",
	schedule_daily: "Daily Schedule",
	schedule_weekly: "Weekly Schedule",
	manual: "Manual Run",
	repo_scan: "Repo History Scan",
};

import { RULE_META, type RuleKey } from "@tripwire/db";
import { formatCamelCase } from "#/lib/format";

/** Rule labels derived from the single source of truth in @tripwire/db */
const ruleLabels: Record<string, string> = new Proxy(
	Object.fromEntries(Object.entries(RULE_META).map(([k, v]) => [k, v.name])),
	{ get(target, prop: string) { return target[prop] ?? formatCamelCase(prop); } },
);

/** Rules hidden from the workflow palette */
const HIDDEN_RULES = new Set(
	Object.entries(RULE_META).filter(([, v]) => v.comingSoon).map(([k]) => k),
);

const actionLabels: Record<string, string> = {
	block: "Block",
	warn: "Warn",
	log: "Log Event",
	close: "Close",
	label: "Add Label",
	comment: "Comment",
	add_to_whitelist: "Whitelist",
	add_to_blacklist: "Blacklist",
	remove_from_whitelist: "Remove Whitelist",
	remove_from_blacklist: "Remove Blacklist",
	notify_slack: "Notify Slack",
	notify_discord: "Notify Discord",
	send_webhook: "Send Webhook",
	request_review: "Request Review",
};
export const TriggerNode = memo(({ data, selected }: NodeProps) => {
	const trigger = (data.trigger as string) ?? "pr_opened";
	return (
		<>
			<NodeShell
				color={colors.trigger}
				icon={icons.trigger}
				label={triggerLabels[trigger] ?? trigger}
				sublabel="Trigger"
				selected={selected}
			>
				{data.filters ? (
					<Param label="Filter" value={String(data.filters)} />
				) : null}
			</NodeShell>
			<Handle type="source" position={Position.Bottom} className={`${handleBase} !-bottom-1.5`} />
		</>
	);
});
TriggerNode.displayName = "TriggerNode";

export const RuleNode = memo(({ id, data, selected }: NodeProps) => {
	const rule = (data.rule as string) ?? "accountAge";
	const params = data.params as Record<string, unknown> | undefined;
	return (
		<>
			<Handle type="target" position={Position.Top} className={`${handleBase} !-top-1.5`} />
			<NodeShell
				color={colors.rule}
				icon={icons.rule}
				label={ruleLabels[rule] ?? rule}
				sublabel="Rule Check"
				selected={selected}
			>
				{params && Object.entries(params).map(([k, v]) => {
					if (typeof v === "number") {
						return <EditableParam key={k} label={k} value={v} nodeId={id} paramKey={k} />;
					}
					return <Param key={k} label={k} value={String(v)} />;
				})}
			</NodeShell>
			<Handle type="source" position={Position.Bottom} id="pass" className={`${handleBase} !-bottom-1.5 !left-[30%] !bg-tw-success/20 !border-tw-success/40`} />
			<Handle type="source" position={Position.Bottom} id="fail" className={`${handleBase} !-bottom-1.5 !left-[70%] !bg-tw-error/20 !border-tw-error/40`} />
		</>
	);
});
RuleNode.displayName = "RuleNode";

export const ConditionNode = memo(({ id, data, selected }: NodeProps) => {
	const field = (data.field as string) ?? "score";
	const op = (data.operator as string) ?? ">";
	const val = data.value ?? "50";
	const { setNodes } = useReactFlow();

	const updateField = useCallback((key: string, newVal: string) => {
		setNodes((nodes) => nodes.map((n) => n.id !== id ? n : { ...n, data: { ...n.data, [key]: newVal } }));
	}, [id, setNodes]);

	return (
		<>
			<Handle type="target" position={Position.Top} className={`${handleBase} !-top-1.5`} />
			<NodeShell
				color={colors.condition}
				icon={icons.condition}
				label="Condition"
				sublabel={`${field} ${op} ${val}`}
				selected={selected}
			>
				<Param label="Field" value={String(field)} />
				<Param label="Operator" value={String(op)} />
				<EditableParam label="Value" value={Number(val) || 0} nodeId={id} paramKey="value" directData />
			</NodeShell>
			<Handle type="source" position={Position.Bottom} id="true" className={`${handleBase} !-bottom-1.5 !left-[30%] !bg-tw-success/20 !border-tw-success/40`} />
			<Handle type="source" position={Position.Bottom} id="false" className={`${handleBase} !-bottom-1.5 !left-[70%] !bg-tw-error/20 !border-tw-error/40`} />
		</>
	);
});
ConditionNode.displayName = "ConditionNode";

export const LogicNode = memo(({ data, selected }: NodeProps) => {
	const gate = (data.gate as string) ?? "AND";
	return (
		<>
			<Handle type="target" position={Position.Top} id="a" className={`${handleBase} !-top-1.5 !left-[30%]`} />
			<Handle type="target" position={Position.Top} id="b" className={`${handleBase} !-top-1.5 !left-[70%]`} />
			<NodeShell
				color={colors.logic}
				icon={icons.logic}
				label={gate}
				sublabel="Logic Gate"
				selected={selected}
			/>
			<Handle type="source" position={Position.Bottom} className={`${handleBase} !-bottom-1.5`} />
		</>
	);
});
LogicNode.displayName = "LogicNode";

export const ActionNode = memo(({ id, data, selected }: NodeProps) => {
	const action = (data.action as string) ?? "block";
	const showMessage = ["block", "warn", "comment", "log"].includes(action);
	const showLabel = action === "label";
	const showUrl = ["send_webhook", "notify_slack", "notify_discord"].includes(action);
	return (
		<>
			<Handle type="target" position={Position.Top} className={`${handleBase} !-top-1.5`} />
			<NodeShell
				color={colors.action}
				icon={icons.action}
				label={actionLabels[action] ?? action}
				sublabel="Action"
				selected={selected}
			>
				{showMessage && <EditableText label="Message" value={String(data.message ?? "")} nodeId={id} fieldKey="message" placeholder="Enter message..." />}
				{showLabel && <EditableText label="Label" value={String(data.label ?? "")} nodeId={id} fieldKey="label" placeholder="label-name" />}
				{showUrl && <EditableText label="URL" value={String(data.url ?? "")} nodeId={id} fieldKey="url" placeholder="https://..." />}
			</NodeShell>
		</>
	);
});
ActionNode.displayName = "ActionNode";

export const DelayNode = memo(({ id, data, selected }: NodeProps) => {
	const duration = (data.duration as string) ?? "5m";
	return (
		<>
			<Handle type="target" position={Position.Top} className={`${handleBase} !-top-1.5`} />
			<NodeShell
				color={colors.delay}
				icon={icons.delay}
				label="Delay"
				sublabel={`Wait ${duration}`}
				selected={selected}
			>
				<EditableText label="Duration" value={duration} nodeId={id} fieldKey="duration" placeholder="5m, 1h, 1d" />
			</NodeShell>
			<Handle type="source" position={Position.Bottom} className={`${handleBase} !-bottom-1.5`} />
		</>
	);
});
DelayNode.displayName = "DelayNode";

export const TransformNode = memo(({ data, selected }: NodeProps) => {
	const transform = (data.transform as string) ?? "fetch_github_user";
	const transformLabels: Record<string, string> = {
		fetch_github_user: "Fetch GitHub User",
		compute_score: "Compute Score",
		fetch_pr_files: "Fetch PR Files",
		fetch_repo_activity: "Fetch Repo Activity",
		count_recent_prs: "Count Recent PRs",
		detect_language: "Detect Language",
		scan_history: "Scan Repo History",
	};
	return (
		<>
			<Handle type="target" position={Position.Top} className={`${handleBase} !-top-1.5`} />
			<NodeShell
				color={colors.transform}
				icon={icons.transform}
				label={transformLabels[transform] ?? transform}
				sublabel="Transform / Enrich"
				selected={selected}
			/>
			<Handle type="source" position={Position.Bottom} className={`${handleBase} !-bottom-1.5`} />
		</>
	);
});
TransformNode.displayName = "TransformNode";
export const nodeTypes = {
	trigger: TriggerNode,
	rule: RuleNode,
	condition: ConditionNode,
	logic: LogicNode,
	action: ActionNode,
	delay: DelayNode,
	transform: TransformNode,
};

export { colors as nodeColors, icons as nodeIcons, triggerLabels, ruleLabels, actionLabels, HIDDEN_RULES };
