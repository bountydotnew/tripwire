import { useRef, useEffect, useMemo } from "react";
import type { UIMessage, MessagePart } from "@tanstack/ai-client";
import { JSONUIProvider, Renderer } from "@json-render/react";
import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";
import { useAIChat } from "#/lib/ai/chat-context";
import { registry } from "#/lib/ai/ui-registry";

// ─── Main Component ──────────────────────────────────────────

export function ChatThread() {
	const { messages, isLoading, respondToToolApproval, error } = useAIChat();
	const bottomRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to bottom when messages change
	useEffect(() => {
		if (messages.length > 0) {
			setTimeout(
				() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
				50,
			);
		}
	}, [messages.length]);

	// Show the Tripwire avatar only on the last message of each consecutive AI run
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

// ─── Empty State ─────────────────────────────────────────────

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<div className="size-12 flex items-center justify-center mb-3">
				<TripwireMiniLogo size={20} />
			</div>
			<p className="text-[14px] text-tw-text-secondary mb-1">
				Ask me anything
			</p>
			<p className="text-[12px] text-tw-text-muted max-w-[240px]">
				I can help you investigate contributors, manage your blacklist, and
				understand activity patterns.
			</p>
		</div>
	);
}

// ─── Error Message (Destructive Agent Message) ───────────────

function ErrorMessage({ message }: { message: string }) {
	// Parse error for user-friendly display
	const { title, detail } = parseErrorMessage(message);

	return (
		<div className="flex items-end gap-2 px-1">
			{/* Tripwire avatar with error tint */}
			<div className="w-6 shrink-0">
				<div className="size-6 rounded-full bg-[#F56D5D1A] flex items-center justify-center">
					<TripwireMiniLogo size={12} />
				</div>
			</div>

			<div className="flex-1 min-w-0 flex flex-col gap-1.5">
				{/* Error card */}
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
							<div className="text-[13px] font-medium text-tw-error leading-tight">
								{title}
							</div>
							{detail && (
								<div className="text-[12px] text-tw-text-secondary mt-1 leading-relaxed">
									{detail}
								</div>
							)}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}

function parseErrorMessage(message: string): { title: string; detail: string | null } {
	// Handle common error patterns
	const lowerMsg = message.toLowerCase();

	if (lowerMsg.includes("api key") || lowerMsg.includes("apikey") || lowerMsg.includes("unauthorized")) {
		return {
			title: "Missing API Key",
			detail: "The AI service isn't configured. Check that OPENROUTER_API_KEY is set in your environment.",
		};
	}

	if (lowerMsg.includes("repository") || lowerMsg.includes("repoid")) {
		return {
			title: "No repository selected",
			detail: "No active repository was resolved for this chat request. Open Integrations and confirm at least one repository is connected.",
		};
	}

	if (lowerMsg.includes("network") || lowerMsg.includes("fetch") || lowerMsg.includes("connection")) {
		return {
			title: "Connection error",
			detail: "Couldn't reach the server. Check your internet connection and try again.",
		};
	}

	if (lowerMsg.includes("rate limit") || lowerMsg.includes("too many")) {
		return {
			title: "Rate limited",
			detail: "Too many requests. Please wait a moment and try again.",
		};
	}

	// Default: show raw message
	return {
		title: "Something went wrong",
		detail: message,
	};
}

// ─── Loading Indicator ───────────────────────────────────────

function LoadingIndicator() {
	return (
		<div className="flex items-end gap-2 px-1">
			<div className="w-6 shrink-0">
				<div className="size-6 rounded-full bg-[#FAFAFA14] flex items-center justify-center">
					<TripwireMiniLogo />
				</div>
			</div>
			<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					className="animate-spin"
				>
					<circle
						cx="7"
						cy="7"
						r="5"
						stroke="currentColor"
						strokeWidth="1.5"
						fill="none"
						strokeDasharray="20"
						strokeDashoffset="5"
					/>
				</svg>
				<span>Thinking...</span>
			</div>
		</div>
	);
}

// ─── Chat Message ────────────────────────────────────────────

interface ChatMessageProps {
	message: UIMessage;
	showAvatar: boolean;
	onRespondToApproval: (approvalId: string, approved: boolean) => void;
}

function ChatMessage({
	message,
	showAvatar,
	onRespondToApproval,
}: ChatMessageProps) {
	if (message.role === "user") {
		return <UserMessage content={getTextContent(message)} />;
	}

	// Collect pending approvals for batch handling
	const pendingApprovals = (message.parts ?? []).filter(
		(part): part is MessagePart & { type: "tool-call"; approval: { id: string } } =>
			part.type === "tool-call" &&
			part.state === "approval-requested" &&
			!!part.approval,
	);

	const handleApproveAll = async () => {
		// Approve sequentially with delay to avoid race condition in TanStack AI
		for (let i = 0; i < pendingApprovals.length; i++) {
			onRespondToApproval(pendingApprovals[i].approval.id, true);
			// Wait longer between approvals to let stream settle
			if (i < pendingApprovals.length - 1) {
				await new Promise((r) => setTimeout(r, 200));
			}
		}
	};

	const handleDenyAll = () => {
		// Denials don't trigger streams, can do all at once
		for (const part of pendingApprovals) {
			onRespondToApproval(part.approval.id, false);
		}
	};

	// Group consecutive ActionResult tool-results by action type
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
						// Different action, flush current group and start new
						flushGroup();
						currentGroup.push({ part, data: actionResult });
						currentAction = actionResult.action;
						continue;
					}
				}
			}

			// Non-groupable part, flush pending group
			flushGroup();
			result.push(part);
		}

		// Flush remaining group
		flushGroup();

		return result;
	}, [message.parts]);

	// Assistant message
	return (
		<div className="flex items-end gap-2 px-1">
			{/* Avatar placeholder - only visible on last message of run */}
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
						{/* Render non-approval parts (with grouping) */}
						{groupedParts
							.filter((p) => p.type !== "tool-call" || (p as MessagePart & { state?: string }).state !== "approval-requested")
							.map((part) => {
								if (part.type === "grouped-results") {
									return <CombinedActionResult key={part.key} results={part.results} />;
								}
								const mp = part as MessagePart;
								return (
									<MessagePartRenderer
										key={getPartKey(mp, message.id)}
										part={mp}
										onRespondToApproval={onRespondToApproval}
									/>
								);
							})}
						{/* Batch approval card */}
						<BatchApprovalCard
							approvals={pendingApprovals}
							onApproveAll={handleApproveAll}
							onDenyAll={handleDenyAll}
						/>
					</>
				) : (
					groupedParts.map((part) => {
						if (part.type === "grouped-results") {
							return <CombinedActionResult key={part.key} results={part.results} />;
						}
						const mp = part as MessagePart;
						return (
							<MessagePartRenderer
								key={getPartKey(mp, message.id)}
								part={mp}
								onRespondToApproval={onRespondToApproval}
							/>
						);
					})
				)}
			</div>
		</div>
	);
}

// ─── User Message ────────────────────────────────────────────

function UserMessage({ content }: { content: string }) {
	return (
		<div className="flex justify-end px-1">
			<div className="max-w-[86%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[#252528] text-[13px] leading-[19px] text-tw-text-primary">
				{content}
			</div>
		</div>
	);
}

// ─── Message Part Renderer ───────────────────────────────────

interface MessagePartRendererProps {
	part: MessagePart;
	onRespondToApproval: (approvalId: string, approved: boolean) => void;
}

function MessagePartRenderer({
	part,
	onRespondToApproval,
}: MessagePartRendererProps) {
	switch (part.type) {
		case "text":
			return (
				<MarkdownText content={part.content} />
			);

		case "tool-call": {
			// Use arguments (per TanStack AI docs) - it's a JSON string that streams incrementally
			let toolArgs: Record<string, unknown> = {};
			if (part.arguments) {
				try {
					toolArgs = JSON.parse(part.arguments);
				} catch {
					// Arguments still streaming, use empty object
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

			// Show tool call status
			return (
				<ToolCallChip
					toolName={part.name}
					args={toolArgs}
					state={part.state}
				/>
			);
		}

		case "tool-result":
			// Tool results are usually displayed inline or as cards
			// Try to parse content as JSON for rich display
			try {
				const parsed = JSON.parse(part.content);
				return <ToolResultDisplay result={parsed} />;
			} catch {
				// If not JSON, just display as text
				return (
					<div className="text-[12px] text-tw-text-muted">
						{part.content}
					</div>
				);
			}

		default:
			return null;
	}
}

// ─── Markdown Text ───────────────────────────────────────────

function MarkdownText({ content }: { content: string }) {
	return (
		<Streamdown
			className="tw-chat-markdown"
			mode="static"
			plugins={{ code }}
			controls={false}
			linkSafety={{ enabled: false }}
		>
			{content}
		</Streamdown>
	);
}

// ─── Tool Call Chip ──────────────────────────────────────────

interface ToolCallChipProps {
	toolName: string;
	args: Record<string, unknown>;
	state: string;
}

function ToolCallChip({ toolName, args, state }: ToolCallChipProps) {
	// Tool call states: 'awaiting-input' | 'input-streaming' | 'input-complete' | 'approval-requested' | 'approval-responded'
	// We consider it complete once input is fully received
	const isComplete = state === "input-complete" || state === "approval-responded";
	const displayName = formatToolName(toolName);
	const argsStr = formatToolArgs(toolName, args);

	return (
		<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
			{isComplete ? (
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					fill="none"
					className="text-tw-success"
				>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<path
						d="M4 7L6 9L10 5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : (
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					className="animate-spin"
				>
					<circle
						cx="7"
						cy="7"
						r="5"
						stroke="currentColor"
						strokeWidth="1.5"
						fill="none"
						strokeDasharray="20"
						strokeDashoffset="5"
					/>
				</svg>
			)}
			<span className="font-mono">{displayName}</span>
			{argsStr && (
				<span className="text-tw-text-tertiary truncate max-w-[140px]">
					{argsStr}
				</span>
			)}
		</div>
	);
}

// ─── Tool Approval Card ──────────────────────────────────────

interface ToolApprovalCardProps {
	toolName: string;
	args: Record<string, unknown>;
	onApprove: () => void;
	onDeny: () => void;
}

function ToolApprovalCard({
	toolName,
	args,
	onApprove,
	onDeny,
}: ToolApprovalCardProps) {
	const username = args.username as string | undefined;
	const { text, yesLabel, noLabel } = getApprovalText(toolName, username);

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[13px] text-tw-text-primary">
				{renderInlineText(text)}
			</div>
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

// ─── Batch Approval Card ─────────────────────────────────────

interface BatchApprovalCardProps {
	approvals: Array<MessagePart & { type: "tool-call"; approval: { id: string } }>;
	onApproveAll: () => void;
	onDenyAll: () => void;
}

function BatchApprovalCard({
	approvals,
	onApproveAll,
	onDenyAll,
}: BatchApprovalCardProps) {
	// Parse all tool arguments
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

	// Check if all actions are the same type
	const allSameAction = parsed.every((p) => p.name === parsed[0].name);
	const usernames = parsed.map((p) => p.username).filter(Boolean) as string[];

	if (allSameAction && usernames.length > 1) {
		// Condensed view for same action type
		const action = parsed[0].name;
		const lastUser = usernames[usernames.length - 1];
		const userList = usernames.slice(0, -1).map((u) => `@${u}`).join(", ") + ` and @${lastUser}`;

		const { prefix, suffix, consequence, buttonLabel } = getBatchApprovalText(action);

		return (
			<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
				<div className="text-[13px] text-tw-text-primary">
					{prefix} {renderInlineText(userList)}{suffix ? ` ${suffix}` : ""}?
				</div>
				{consequence && (
					<div className="text-[12px] text-tw-text-muted">
						{consequence}
					</div>
				)}
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

	// Different actions - show brief list
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
				{approvals.length} actions
			</div>
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

function getBatchApprovalText(action: string): { prefix: string; suffix: string; consequence: string | null; buttonLabel: string } {
	switch (action) {
		case "add_to_blacklist":
			return { prefix: "Blacklist", suffix: "", consequence: "They will be blocked from all future contributions.", buttonLabel: "blacklist" };
		case "remove_from_blacklist":
			return { prefix: "Remove", suffix: "from the blacklist", consequence: null, buttonLabel: "remove" };
		case "add_to_whitelist":
			return { prefix: "Whitelist", suffix: "", consequence: "They will bypass all rule checks.", buttonLabel: "whitelist" };
		case "remove_from_whitelist":
			return { prefix: "Remove", suffix: "from the whitelist", consequence: null, buttonLabel: "remove" };
		case "move_to_whitelist":
			return { prefix: "Move", suffix: "to the whitelist", consequence: "They will be unblocked and bypass all rule checks.", buttonLabel: "move" };
		case "move_to_blacklist":
			return { prefix: "Move", suffix: "to the blacklist", consequence: "They will be blocked from all future contributions.", buttonLabel: "move" };
		default:
			return { prefix: "Approve", suffix: "", consequence: null, buttonLabel: "approve" };
	}
}

function getBriefActionText(action: string, username?: string): React.ReactNode {
	const user = username ? <>{renderInlineText(`@${username}`)}</> : "user";
	switch (action) {
		case "add_to_blacklist":
			return <>Blacklist {user}</>;
		case "remove_from_blacklist":
			return <>Remove {user} from blacklist</>;
		case "add_to_whitelist":
			return <>Whitelist {user}</>;
		case "remove_from_whitelist":
			return <>Remove {user} from whitelist</>;
		case "move_to_whitelist":
			return <>Move {user} to whitelist</>;
		case "move_to_blacklist":
			return <>Move {user} to blacklist</>;
		default:
			return <>{action.replace(/_/g, " ")} {user}</>;
	}
}

// ─── Tool Result Display ─────────────────────────────────────

function ToolResultDisplay({ result }: { result: unknown }) {
	if (!result || typeof result !== "object") return null;

	const r = result as Record<string, unknown>;

	// Check if this is a json-render spec (has root key and elements map)
	if ("root" in r && "elements" in r && typeof r.root === "string") {
		return (
			<JSONUIProvider registry={registry}>
				<Renderer spec={r as any} registry={registry} />
			</JSONUIProvider>
		);
	}

	// No spec found - let the AI summarize instead
	return null;
}

// ─── Combined Action Result ──────────────────────────────────

interface ActionResultData {
	success: boolean;
	message: string;
	action: string;
	username?: string;
}

function parseActionResult(content: string): ActionResultData | null {
	try {
		const parsed = JSON.parse(content);
		if (parsed?.root === "main" && parsed?.elements?.main?.type === "ActionResult") {
			const props = parsed.elements.main.props;
			// Extract username from message
			const match = props.message?.match(/@(\w+)/);
			return {
				success: props.success,
				message: props.message,
				action: props.action,
				username: match?.[1],
			};
		}
	} catch {
		// Not valid JSON
	}
	return null;
}

function CombinedActionResult({ results }: { results: ActionResultData[] }) {
	if (results.length === 0) return null;

	const allSuccess = results.every((r) => r.success);
	const usernames = results.map((r) => r.username).filter(Boolean) as string[];

	// Build combined message by parsing the first result's message pattern
	let message: string;
	if (usernames.length <= 1) {
		message = results[0].message;
	} else {
		// Parse pattern from first message: "@username has been X" -> "@list have been X"
		const firstMsg = results[0].message;
		const match = firstMsg.match(/^@\w+\s+has\s+been\s+(.+)$/);

		if (match) {
			const lastUser = usernames.pop()!;
			const userList = "@" + usernames.join(", @") + ` and @${lastUser}`;
			message = `${userList} have been ${match[1]}`;
		} else {
			// Fallback: just list the users
			const lastUser = usernames.pop()!;
			const userList = "@" + usernames.join(", @") + ` and @${lastUser}`;
			message = `${userList}: ${results[0].message.replace(/@\w+\s*/, "")}`;
		}
	}

	const bgColor = allSuccess
		? "bg-[#4ADE801A] border-tw-success/20"
		: "bg-[#F56D5D1A] border-tw-error/20";
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

// ─── Inline Text Rendering ───────────────────────────────────

function renderInlineText(text: string): React.ReactNode {
	if (!text) return text;
	const regex =
		/(@[A-Za-z0-9][A-Za-z0-9_-]*)|((?:PR|Issue|issue)\s+#\d+)|(#\d+)/g;
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	let key = 0;
	// biome-ignore lint/suspicious/noAssignInExpressions: needed for regex iteration
	while ((m = regex.exec(text)) !== null) {
		if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
		const tok = m[0];
		if (tok.startsWith("@")) {
			parts.push(<UserMentionChip key={`u${key++}`} username={tok.slice(1)} />);
		} else {
			const mm = tok.match(/^(?:(PR|Issue|issue)\s+)?#(\d+)$/);
			const rawLabel = mm?.[1];
			const label = rawLabel
				? rawLabel.toLowerCase() === "issue"
					? "Issue"
					: "PR"
				: null;
			parts.push(
				<IssueChip key={`i${key++}`} label={label} number={mm?.[2] || ""} />,
			);
		}
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

function UserMentionChip({ username }: { username: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<img
				src={`https://github.com/${username}.png?size=28`}
				alt=""
				className="w-3.5 h-3.5 rounded-full bg-[#3a3a3e]"
			/>
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium">
				@{username}
			</span>
		</span>
	);
}

function IssueChip({ label, number }: { label: string | null; number: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<svg
				width="10"
				height="10"
				viewBox="0 0 16 16"
				fill="none"
				className="shrink-0"
			>
				<circle cx="8" cy="8" r="5.5" stroke="#B4B4B4" strokeWidth="1.2" />
				<circle cx="8" cy="8" r="1.5" fill="#B4B4B4" />
			</svg>
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium tabular-nums">
				{label ? `${label} ` : ""}#{number}
			</span>
		</span>
	);
}

// ─── Helpers ─────────────────────────────────────────────────

function getPartKey(part: MessagePart, messageId: string): string {
	if (part.type === "tool-call") return part.id;
	if (part.type === "tool-result") return `${messageId}-result-${part.toolCallId}`;
	if (part.type === "text") return `${messageId}-text`;
	return `${messageId}-${part.type}`;
}

function getTextContent(message: UIMessage): string {
	// Extract text from parts
	const textPart = message.parts?.find((p) => p.type === "text");
	if (textPart && textPart.type === "text") {
		return textPart.content;
	}
	return "";
}

function formatToolName(toolName: string | undefined): string {
	if (!toolName) return "tool";
	return toolName.replace(/_/g, " ");
}

function formatToolArgs(_toolName: string, args: Record<string, unknown>): string {
	if (args.username) return `@${args.username}`;
	if (args.eventId) return args.eventId as string;
	return "";
}

function getApprovalText(
	toolName: string,
	username?: string,
): { text: string; yesLabel: string; noLabel: string } {
	switch (toolName) {
		case "add_to_blacklist":
			return {
				text: `Add @${username} to the blacklist? They will be blocked from all future contributions.`,
				yesLabel: "Yes, blacklist",
				noLabel: "Cancel",
			};
		case "remove_from_blacklist":
			return {
				text: `Remove @${username} from the blacklist?`,
				yesLabel: "Yes, remove",
				noLabel: "Cancel",
			};
		case "add_to_whitelist":
			return {
				text: `Add @${username} to the whitelist? They will bypass all rule checks.`,
				yesLabel: "Yes, whitelist",
				noLabel: "Cancel",
			};
		case "remove_from_whitelist":
			return {
				text: `Remove @${username} from the whitelist?`,
				yesLabel: "Yes, remove",
				noLabel: "Cancel",
			};
		case "move_to_whitelist":
			return {
				text: `Move @${username} from the blacklist to the whitelist?`,
				yesLabel: "Yes, move to whitelist",
				noLabel: "Cancel",
			};
		case "move_to_blacklist":
			return {
				text: `Move @${username} from the whitelist to the blacklist?`,
				yesLabel: "Yes, move to blacklist",
				noLabel: "Cancel",
			};
		default:
			return {
				text: `Approve ${toolName}?`,
				yesLabel: "Approve",
				noLabel: "Deny",
			};
	}
}

// ─── Icons ───────────────────────────────────────────────────

function TripwireMiniLogo({ size = 12 }: { size?: number }) {
	return (
		<svg
			viewBox="0 0 610.08 589.32"
			width={size}
			height={size}
			fill="#B4B4B4"
			preserveAspectRatio="none"
		>
			<path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
			<circle cx="305.04" cy="90.37" r="90.37" />
		</svg>
	);
}

