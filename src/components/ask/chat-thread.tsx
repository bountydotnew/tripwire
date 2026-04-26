import { useRef, useEffect, useMemo } from "react";
import type { UIMessage, MessagePart } from "@tanstack/ai-client";
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

export function ChatThread() {
	const { messages, isLoading, respondToToolApproval, error, isQuotaExhausted } = useAIChat();
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
			{messages.map((msg) => (
				<ChatMessage
					key={msg.id}
					message={msg}
					showAvatar={avatarMap[msg.id] !== false}
					onRespondToApproval={respondToToolApproval}
				/>
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
			<p className="text-[14px] text-tw-text-secondary mb-1">Out of messages</p>
			<p className="text-[12px] text-tw-text-muted max-w-[220px]">
				You've used all your AI messages for this month.
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
	return (
		<div className="flex items-end gap-2 px-1">
			<div className="w-6 shrink-0">
				<div className="size-6 rounded-full bg-[#FAFAFA14] flex items-center justify-center">
					<TripwireMiniLogo />
				</div>
			</div>
			<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
				<svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
					<circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="20" strokeDashoffset="5" />
				</svg>
				<span>Thinking...</span>
			</div>
		</div>
	);
}

interface ChatMessageProps {
	message: UIMessage;
	showAvatar: boolean;
	onRespondToApproval: (approvalId: string, approved: boolean) => void;
}

function ChatMessage({ message, showAvatar, onRespondToApproval }: ChatMessageProps) {
	if (message.role === "user") {
		return <UserMessage content={getTextContent(message)} />;
	}

	const pendingApprovals = (message.parts ?? []).filter(
		(part): part is MessagePart & { type: "tool-call"; approval: { id: string } } =>
			part.type === "tool-call" && part.state === "approval-requested" && !!part.approval,
	);

	const handleApproveAll = async () => {
		for (let i = 0; i < pendingApprovals.length; i++) {
			onRespondToApproval(pendingApprovals[i].approval.id, true);
			if (i < pendingApprovals.length - 1) {
				await new Promise((r) => setTimeout(r, 200));
			}
		}
	};

	const handleDenyAll = () => {
		for (const part of pendingApprovals) {
			onRespondToApproval(part.approval.id, false);
		}
	};

	const groupedParts = useMemo(() => {
		const parts = message.parts ?? [];
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

			if (part.state === "approval-requested" && part.approval) {
				return (
					<ToolApprovalCard
						toolName={part.name}
						args={toolArgs}
						onApprove={() => onRespondToApproval(part.approval!.id, true)}
						onDeny={() => onRespondToApproval(part.approval!.id, false)}
					/>
				);
			}

			return <ToolCallChip toolName={part.name} args={toolArgs} state={part.state} />;
		}

		case "tool-result":
			try {
				const parsed = JSON.parse(part.content);
				return <ToolResultDisplay result={parsed} />;
			} catch {
				return <div className="text-[12px] text-tw-text-muted">{part.content}</div>;
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

interface ToolCallChipProps {
	toolName: string;
	args: Record<string, unknown>;
	state: string;
}

function ToolCallChip({ toolName, args, state }: ToolCallChipProps) {
	const isComplete = state === "input-complete" || state === "approval-responded";
	const displayName = formatToolName(toolName);
	const argsStr = formatToolArgs(toolName, args);

	return (
		<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
			{isComplete ? (
				<svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-tw-success">
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<path d="M4 7L6 9L10 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			) : (
				<svg width="14" height="14" viewBox="0 0 14 14" className="animate-spin">
					<circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeDasharray="20" strokeDashoffset="5" />
				</svg>
			)}
			<span className="font-mono">{displayName}</span>
			{argsStr && <span className="text-tw-text-tertiary truncate max-w-[140px]">{argsStr}</span>}
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
				<Renderer spec={r as any} registry={registry} />
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
