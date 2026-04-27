import { useRef, useEffect, useMemo, useState } from "react";
import { UnicodeSpinner, useRandomThinkingVariant } from "#/components/ui/unicode-spinner";
import { useThinkingPhrase } from "#/lib/ai/thinking-phrases";
import type { UIMessage, MessagePart, ToolCallPart, ToolResultPart, RenderSpec } from "#/types/chat";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { useAIChat } from "#/lib/ai/chat-context";
import { registry } from "#/lib/ai/ui-registry";
import type { ActionResultData } from "#/types/chat";
import {
	getPartKey,
	getTextContent,
	formatToolName,
	formatToolArgs,
	parseErrorMessage,
	parseActionResult,
	getApprovalText,
	getBatchApprovalText,
	getBriefActionText,
	renderInlineText,
	TripwireMiniLogo,
} from "#/utils/chat";

interface ChatThreadProps {
	messages?: UIMessage[];
	isLoading?: boolean;
	error?: Error | null;
	isQuotaExhausted?: boolean;
	respondToToolApproval?: (approvalId: string, approved: boolean) => void;
}

export function ChatThread(props: ChatThreadProps = {}) {
	const ctx = useAIChat();
	const messages = props.messages ?? ctx.messages;
	const isLoading = props.isLoading ?? ctx.isLoading;
	const error = props.error ?? ctx.error;
	const isQuotaExhausted = props.isQuotaExhausted ?? ctx.isQuotaExhausted;
	const respondToToolApproval = props.respondToToolApproval ?? ctx.respondToToolApproval;
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (messages.length > 0) {
			setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
		}
	}, [messages.length]);

	const avatarMap = useMemo(() => {
		const out: Record<string, boolean> = {};
		for (let i = 0; i < messages.length; i++) {
			const m = messages[i];
			if (m.role !== "assistant") continue;
			const next = messages[i + 1];
			const isLastInRun = !next || next.role !== "assistant";
			out[m.id] = isLastInRun;
		}
		return out;
	}, [messages]);

	// Detect bulk-loaded messages (conversation loaded from DB)
	const prevCount = useRef(0);
	const [animatingIn, setAnimatingIn] = useState(false);
	useEffect(() => {
		const jumped = messages.length - prevCount.current;
		prevCount.current = messages.length;
		if (jumped > 1) {
			setAnimatingIn(true);
			const timer = setTimeout(() => setAnimatingIn(false), 400 + messages.length * 40);
			return () => clearTimeout(timer);
		}
	}, [messages.length]);

	if (isQuotaExhausted) {
		return <QuotaExhaustedState />;
	}

	if (messages.length === 0 && !error) {
		return <EmptyState />;
	}

	if (messages.length === 0 && error) {
		return (
			<div className="flex flex-col gap-3 pt-1 pb-2">
				<ErrorMessage message={error.message} />
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3 pt-1 pb-2">
			{messages.map((msg, i) => (
				<div
					key={msg.id}
					className="transition-all duration-300 ease-out"
					style={
						animatingIn
							? {
									animation: `chatFadeIn 0.3s ease-out ${i * 40}ms both`,
								}
							: undefined
					}
				>
					<ChatMessage
						message={msg}
						showAvatar={avatarMap[msg.id] !== false}
						onRespondToApproval={respondToToolApproval}
					/>
				</div>
			))}
			{isLoading && <LoadingIndicator />}
			{error && <ErrorMessage message={error.message} />}
			<div ref={bottomRef} />
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="size-12 flex items-center justify-center mb-3">
				<TripwireMiniLogo size={20} />
			</div>
			<p className="text-[14px] text-tw-text-secondary mb-1">Ask me anything</p>
			<p className="text-[12px] text-tw-text-muted max-w-[240px]">
				I can help you investigate contributors, manage your blacklist, and understand activity patterns.
			</p>
		</div>
	);
}

function QuotaExhaustedState() {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="size-12 flex items-center justify-center mb-3 rounded-full bg-[#FAFAFA08]">
				<svg width="20" height="20" viewBox="0 0 20 20" fill="none">
					<rect x="4" y="9" width="12" height="9" rx="1.5" stroke="#9F9FA9" strokeWidth="1.5" />
					<path d="M7 9V6a3 3 0 1 1 6 0v3" stroke="#9F9FA9" strokeWidth="1.5" strokeLinecap="round" />
				</svg>
			</div>
			<p className="text-[14px] text-tw-text-secondary mb-1">Out of credits</p>
			<p className="text-[12px] text-tw-text-muted max-w-[220px]">
				You've used all your AI credits for this month.
			</p>
		</div>
	);
}

function ErrorMessage({ message }: { message: string }) {
	const { title, detail } = parseErrorMessage(message);

	return (
		<div className="flex items-end gap-2 px-1">
			<div className="w-6 shrink-0">
				<div className="size-6 rounded-full bg-[#F56D5D1A] flex items-center justify-center">
					<TripwireMiniLogo size={12} />
				</div>
			</div>
			<div className="flex-1 min-w-0 flex flex-col gap-1.5">
				<div className="rounded-xl bg-[#F56D5D0D] border border-tw-error/10 p-3">
					<div className="flex items-start gap-2">
						<div className="shrink-0 mt-0.5">
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-tw-error">
								<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
								<path d="M7 4v3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
								<circle cx="7" cy="9.5" r="0.75" fill="currentColor" />
							</svg>
						</div>
						<div className="flex-1 min-w-0">
							<div className="text-[13px] font-medium text-tw-error leading-tight">{title}</div>
							{detail && (
								<div className="text-[12px] text-tw-text-secondary mt-1 leading-relaxed">{detail}</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function LoadingIndicator() {
	const variant = useRandomThinkingVariant();
	const phrase = useThinkingPhrase();

	return (
		<div className="flex items-end gap-2 px-1">
			<div className="w-6 shrink-0">
				<div className="size-6 rounded-full bg-[#FAFAFA14] flex items-center justify-center">
					<TripwireMiniLogo />
				</div>
			</div>
			<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
				<UnicodeSpinner variant={variant} className="text-[13px] opacity-80" label={phrase} />
				<span>{phrase}...</span>
			</div>
		</div>
	);
}

interface ChatMessageProps {
	message: UIMessage;
	showAvatar: boolean;
	onRespondToApproval: (approvalId: string, approved: boolean) => void;
}

// Track approval IDs that have already been responded to.
// Module-level so it survives component remounts.
const handledApprovalIds = new Set<string>();

function ChatMessage({ message, showAvatar, onRespondToApproval }: ChatMessageProps) {
	if (message.role === "user") {
		return <UserMessage content={getTextContent(message)} />;
	}

	const pendingApprovals = (message.parts ?? []).filter(
		(part): part is MessagePart & { type: "tool-call"; approval: { id: string } } =>
			part.type === "tool-call" && part.state === "approval-requested" && !!part.approval
			&& !handledApprovalIds.has(part.approval.id),
	);

	const handleApproveAll = () => {
		for (const part of pendingApprovals) {
			if (handledApprovalIds.has(part.approval.id)) continue;
			handledApprovalIds.add(part.approval.id);
			onRespondToApproval(part.approval.id, true);
		}
	};

	const handleDenyAll = () => {
		for (const part of pendingApprovals) {
			if (handledApprovalIds.has(part.approval.id)) continue;
			handledApprovalIds.add(part.approval.id);
			onRespondToApproval(part.approval.id, false);
		}
	};

	const groupedParts = useMemo(() => {
		const rawParts = message.parts ?? [];

		// Deduplicate parts by toolCallId (TanStack AI can send duplicates)
		const seen = new Set<string>();
		const parts = rawParts.filter((part) => {
			if (part.type === "tool-call" || part.type === "tool-result") {
				const id = part.type === "tool-result"
					? (part as ToolResultPart).toolCallId
					: (part as ToolCallPart).id;
				const key = `${part.type}-${id}`;
				if (id && seen.has(key)) return false;
				if (id) seen.add(key);
			}
			return true;
		});

		const result: Array<MessagePart | { type: "grouped-results"; results: ActionResultData[]; key: string }> = [];
		let currentGroup: Array<{ part: MessagePart; data: ActionResultData }> = [];
		let currentAction: string | null = null;

		const flushGroup = () => {
			if (currentGroup.length > 1) {
				result.push({
					type: "grouped-results",
					results: currentGroup.map((g) => g.data),
					key: `group-${result.length}`,
				});
			} else if (currentGroup.length === 1) {
				result.push(currentGroup[0].part);
			}
			currentGroup = [];
			currentAction = null;
		};

		for (const part of parts) {
			if (part.type === "tool-result") {
				const actionResult = parseActionResult(part.content);
				if (actionResult && actionResult.success) {
					if (currentAction === null || currentAction === actionResult.action) {
						currentGroup.push({ part, data: actionResult });
						currentAction = actionResult.action;
						continue;
					} else {
						flushGroup();
						currentGroup.push({ part, data: actionResult });
						currentAction = actionResult.action;
						continue;
					}
				}
			}
			flushGroup();
			result.push(part);
		}
		flushGroup();
		return result;
	}, [message.parts]);

	return (
		<div className="flex items-end gap-2 px-1">
			<div className="w-6 shrink-0">
				{showAvatar && (
					<div className="size-6 rounded-full bg-[#FAFAFA14] flex items-center justify-center">
						<TripwireMiniLogo />
					</div>
				)}
			</div>
			<div className="flex-1 min-w-0 flex flex-col gap-2">
				{pendingApprovals.length > 1 ? (
					<>
						{groupedParts
							.filter((p) => p.type !== "tool-call" || (p as MessagePart & { state?: string }).state !== "approval-requested")
							.map((part) => {
								if (part.type === "grouped-results") {
									return <CombinedActionResult key={part.key} results={part.results} />;
								}
								const mp = part as MessagePart;
								return <MessagePartRenderer key={getPartKey(mp, message.id)} part={mp} onRespondToApproval={onRespondToApproval} />;
							})}
						<BatchApprovalCard approvals={pendingApprovals} onApproveAll={handleApproveAll} onDenyAll={handleDenyAll} />
					</>
				) : (
					groupedParts.map((part) => {
						if (part.type === "grouped-results") {
							return <CombinedActionResult key={part.key} results={part.results} />;
						}
						const mp = part as MessagePart;
						return <MessagePartRenderer key={getPartKey(mp, message.id)} part={mp} onRespondToApproval={onRespondToApproval} />;
					})
				)}
			</div>
		</div>
	);
}

function UserMessage({ content }: { content: string }) {
	return (
		<div className="flex justify-end px-1">
			<div className="max-w-[86%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[#252528] text-[13px] leading-[19px] text-tw-text-primary">
				{content}
			</div>
		</div>
	);
}

interface MessagePartRendererProps {
	part: MessagePart;
	onRespondToApproval: (approvalId: string, approved: boolean) => void;
}

function MessagePartRenderer({ part, onRespondToApproval }: MessagePartRendererProps) {
	switch (part.type) {
		case "text":
			return <MarkdownText content={part.content} />;

		case "reasoning":
		case "thinking":
			return <ReasoningBlock content={(part as { content?: string; text?: string }).content ?? (part as { text?: string }).text ?? ""} />;

		case "tool-call": {
			let toolArgs: Record<string, unknown> = {};
			if (part.arguments) {
				try {
					toolArgs = JSON.parse(part.arguments);
				} catch {
					// Arguments still streaming
				}
			} else if (part.input) {
				toolArgs = part.input as Record<string, unknown>;
			}

			if (part.state === "approval-requested" && part.approval && !handledApprovalIds.has(part.approval.id)) {
				return (
					<ToolApprovalCard
						toolName={part.name}
						args={toolArgs}
						onApprove={() => {
							handledApprovalIds.add(part.approval!.id);
							onRespondToApproval(part.approval!.id, true);
						}}
						onDeny={() => {
							handledApprovalIds.add(part.approval!.id);
							onRespondToApproval(part.approval!.id, false);
						}}
					/>
				);
			}

			return <ToolStep toolName={part.name} args={toolArgs} state={part.state} />;
		}

		case "tool-result":
			// Tool results are now shown inside ToolStep's collapsible detail
			// Only render standalone if there's a UI card (json-render spec)
			try {
				const parsed = JSON.parse(part.content);
				if (parsed && typeof parsed === "object" && "root" in parsed && "elements" in parsed) {
					return <ToolResultDisplay result={parsed} />;
				}
				return null; // Absorbed into ToolStep
			} catch {
				return null;
			}

		default:
			return null;
	}
}

function MarkdownText({ content }: { content: string }) {
	return (
		<Streamdown className="tw-chat-markdown" mode="static" plugins={{ code }} controls={false} linkSafety={{ enabled: false }}>
			{content}
		</Streamdown>
	);
}

interface ToolStepProps {
	toolName: string;
	args: Record<string, unknown>;
	state: string;
}

function ToolStep({ toolName, args, state }: ToolStepProps) {
	const [isOpen, setIsOpen] = useState(false);
	const isComplete = state === "input-complete" || state === "approval-responded";
	const isError = state === "error" || state === "output-error";
	const displayName = formatToolName(toolName);
	const argsStr = formatToolArgs(toolName, args);
	const hasArgs = Object.keys(args).length > 0;

	return (
		<div className="flex flex-col">
			<button
				type="button"
				onClick={() => hasArgs && setIsOpen(!isOpen)}
				className={`flex items-center gap-2 py-0.5 text-[12px] text-tw-text-muted ${hasArgs ? "cursor-pointer hover:text-[#E0E0E0]" : "cursor-default"} transition-colors`}
			>
				{isError ? (
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-red-400/60">
						<circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
						<path d="M4.5 4.5L7.5 7.5M7.5 4.5L4.5 7.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
					</svg>
				) : isComplete ? (
					<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-tw-success/60">
						<circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
						<path d="M3.5 6L5 7.5L8.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				) : (
					<UnicodeSpinner variant="dots" className="text-[12px] text-tw-text-secondary" label={displayName} />
				)}
				<span className={isComplete ? "" : "text-tw-text-secondary"}>{displayName}</span>
				{!isOpen && argsStr && <span className="text-tw-text-tertiary truncate max-w-[140px]">{argsStr}</span>}
			</button>
			{isOpen && hasArgs && (
				<div className="ml-5 mt-0.5 mb-1 text-[11px] flex flex-col gap-0.5">
					{Object.entries(args).map(([key, val]) => (
						<div key={key} className="flex gap-2">
							<span className="text-tw-text-muted shrink-0">{key}</span>
							<span className="text-tw-text-secondary font-mono truncate">
								{typeof val === "string" ? val : JSON.stringify(val)}
							</span>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function ReasoningBlock({ content }: { content: string }) {
	const [isOpen, setIsOpen] = useState(false);

	if (!content.trim()) return null;

	return (
		<div className="flex flex-col gap-1">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-1.5 text-[12px] text-tw-text-muted hover:text-tw-text-secondary transition-colors py-0.5"
			>
				<svg
					width="10"
					height="10"
					viewBox="0 0 10 10"
					fill="none"
					className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
				>
					<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
				<span>Thought</span>
			</button>
			{isOpen && (
				<div className="pl-4 border-l border-[#27272A] text-[12px] leading-[18px] text-tw-text-muted/70">
					<Streamdown className="tw-chat-markdown" mode="static" plugins={{ code }} controls={false} linkSafety={{ enabled: false }}>
						{content}
					</Streamdown>
				</div>
			)}
		</div>
	);
}

interface ToolApprovalCardProps {
	toolName: string;
	args: Record<string, unknown>;
	onApprove: () => void;
	onDeny: () => void;
}

function ToolApprovalCard({ toolName, args, onApprove, onDeny }: ToolApprovalCardProps) {
	const username = args.username as string | undefined;
	const { text, yesLabel, noLabel } = getApprovalText(toolName, username);

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[13px] text-tw-text-primary">{renderInlineText(text)}</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onApprove}
					className="h-7 px-3 rounded-lg bg-tw-text-primary text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity"
				>
					{yesLabel}
				</button>
				<button
					type="button"
					onClick={onDeny}
					className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors"
				>
					{noLabel}
				</button>
			</div>
		</div>
	);
}

interface BatchApprovalCardProps {
	approvals: Array<MessagePart & { type: "tool-call"; approval: { id: string } }>;
	onApproveAll: () => void;
	onDenyAll: () => void;
}

function BatchApprovalCard({ approvals, onApproveAll, onDenyAll }: BatchApprovalCardProps) {
	const parsed = approvals.map((part) => {
		let toolArgs: Record<string, unknown> = {};
		if (part.arguments) {
			try {
				toolArgs = JSON.parse(part.arguments);
			} catch {
				// Arguments still streaming
			}
		}
		return { name: part.name, username: toolArgs.username as string | undefined };
	});

	const allSameAction = parsed.every((p) => p.name === parsed[0].name);
	const usernames = parsed.map((p) => p.username).filter(Boolean) as string[];

	if (allSameAction && usernames.length > 1) {
		const action = parsed[0].name;
		const lastUser = usernames[usernames.length - 1];
		const userList = usernames.slice(0, -1).map((u) => `@${u}`).join(", ") + ` and @${lastUser}`;
		const { prefix, suffix, consequence, buttonLabel } = getBatchApprovalText(action);

		return (
			<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
				<div className="text-[13px] text-tw-text-primary">
					{prefix} {renderInlineText(userList)}{suffix ? ` ${suffix}` : ""}?
				</div>
				{consequence && <div className="text-[12px] text-tw-text-muted">{consequence}</div>}
				<div className="flex items-center gap-2 mt-1">
					<button
						type="button"
						onClick={onApproveAll}
						className="h-7 px-3 rounded-lg bg-tw-text-primary text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity"
					>
						Yes, {buttonLabel}
					</button>
					<button
						type="button"
						onClick={onDenyAll}
						className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors"
					>
						Cancel
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">{approvals.length} actions</div>
			<div className="flex flex-col gap-1">
				{parsed.map((p, i) => (
					<div key={approvals[i].id} className="flex items-center gap-2 text-[13px] text-tw-text-primary">
						<span className="size-1.5 rounded-full bg-tw-warning shrink-0" />
						{getBriefActionText(p.name, p.username)}
					</div>
				))}
			</div>
			<div className="flex items-center gap-2 mt-1">
				<button
					type="button"
					onClick={onApproveAll}
					className="h-7 px-3 rounded-lg bg-tw-text-primary text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity"
				>
					Approve all
				</button>
				<button
					type="button"
					onClick={onDenyAll}
					className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors"
				>
					Cancel
				</button>
			</div>
		</div>
	);
}

function ToolResultDisplay({ result }: { result: unknown }) {
	if (!result || typeof result !== "object") return null;

	const r = result as Record<string, unknown>;

	if ("root" in r && "elements" in r && typeof r.root === "string") {
		return (
			<JSONUIProvider registry={registry}>
				<Renderer spec={r as RenderSpec} registry={registry} />
			</JSONUIProvider>
		);
	}

	return null;
}

function CombinedActionResult({ results }: { results: ActionResultData[] }) {
	if (results.length === 0) return null;

	const allSuccess = results.every((r) => r.success);
	const usernames = results.map((r) => r.username).filter(Boolean) as string[];

	let message: string;
	if (usernames.length <= 1) {
		message = results[0].message;
	} else {
		const firstMsg = results[0].message;
		const match = firstMsg.match(/^@\w+\s+has\s+been\s+(.+)$/);

		if (match) {
			const lastUser = usernames.pop()!;
			const userList = "@" + usernames.join(", @") + ` and @${lastUser}`;
			message = `${userList} have been ${match[1]}`;
		} else {
			const lastUser = usernames.pop()!;
			const userList = "@" + usernames.join(", @") + ` and @${lastUser}`;
			message = `${userList}: ${results[0].message.replace(/@\w+\s*/, "")}`;
		}
	}

	const bgColor = allSuccess ? "bg-[#4ADE801A] border-tw-success/20" : "bg-[#F56D5D1A] border-tw-error/20";
	const iconColor = allSuccess ? "text-tw-success" : "text-tw-error";

	return (
		<div className={`rounded-xl border p-3 flex items-center gap-2 ${bgColor}`}>
			{allSuccess ? (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={iconColor}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
					<path d="M4 7L6 9L10 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			) : (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className={iconColor}>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
					<path d="M5 5L9 9M9 5L5 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
				</svg>
			)}
			<span className="text-[13px] text-tw-text-primary">{renderInlineText(message)}</span>
		</div>
	);
}
