import { useRef, useEffect, useMemo } from "react";
import type { UIMessage, MessagePart } from "@tanstack/ai-client";
import { Renderer } from "@json-render/react";
import { useAIChat } from "#/lib/ai/chat-context";
import { registry } from "#/lib/ai/ui-registry";

// ─── Main Component ──────────────────────────────────────────

export function ChatThread() {
	const { messages, isLoading, pendingApproval, approveToolCall, error } = useAIChat();
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
					pendingApproval={pendingApproval}
					onApprove={() => approveToolCall(true)}
					onDeny={() => approveToolCall(false)}
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
			detail: "Select a repository from the workspace picker to start chatting.",
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
	pendingApproval: { toolCallId: string; toolName: string; args: Record<string, unknown> } | null;
	onApprove: () => void;
	onDeny: () => void;
}

function ChatMessage({
	message,
	showAvatar,
	pendingApproval,
	onApprove,
	onDeny,
}: ChatMessageProps) {
	if (message.role === "user") {
		return <UserMessage content={getTextContent(message)} />;
	}

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
				{message.parts?.map((part, i) => (
					<MessagePartRenderer
						key={i}
						part={part}
						pendingApproval={pendingApproval}
						onApprove={onApprove}
						onDeny={onDeny}
					/>
				))}
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
	pendingApproval: { toolCallId: string; toolName: string; args: Record<string, unknown> } | null;
	onApprove: () => void;
	onDeny: () => void;
}

function MessagePartRenderer({
	part,
	pendingApproval,
	onApprove,
	onDeny,
}: MessagePartRendererProps) {
	switch (part.type) {
		case "text":
			return (
				<div className="text-[13px] leading-[19px] text-tw-text-primary">
					{renderInlineText(part.content)}
				</div>
			);

		case "tool-call": {
			// Check if this tool call needs approval
			const needsApproval =
				pendingApproval?.toolCallId === part.id &&
				part.approval?.needsApproval;

			if (needsApproval) {
				return (
					<ToolApprovalCard
						toolName={part.name}
						args={(part.input ?? {}) as Record<string, unknown>}
						onApprove={onApprove}
						onDeny={onDeny}
					/>
				);
			}

			// Show tool call status
			return (
				<ToolCallChip
					toolName={part.name}
					args={(part.input ?? {}) as Record<string, unknown>}
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

// ─── Tool Call Chip ──────────────────────────────────────────

interface ToolCallChipProps {
	toolName: string;
	args: Record<string, unknown>;
	state: string;
}

function ToolCallChip({ toolName, args, state }: ToolCallChipProps) {
	const isComplete = state === "result";
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
					className="h-7 px-3 rounded-lg bg-tw-success text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity"
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

// ─── Tool Result Display ─────────────────────────────────────

function ToolResultDisplay({ result }: { result: unknown }) {
	if (!result || typeof result !== "object") return null;

	const r = result as Record<string, unknown>;

	// Check if this is a json-render spec (has a root element)
	if ("root" in r && r.root && typeof r.root === "object") {
		return <Renderer spec={r as any} registry={registry} />;
	}

	// No spec found - let the AI summarize instead
	return null;
}

// ─── User Profile Card ───────────────────────────────────────

function UserProfileCard({ data }: { data: Record<string, unknown> }) {
	const avatar = data.avatar as string | undefined;
	const username = data.username as string;
	const name = data.name as string | undefined;

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="flex items-center gap-2.5">
				{avatar && (
					<img src={avatar} alt="" className="size-10 rounded-full" />
				)}
				<div>
					<div className="text-[14px] text-tw-text-primary font-medium">
						@{username}
					</div>
					{name && (
						<div className="text-[12px] text-tw-text-muted">{name}</div>
					)}
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2 text-[12px]">
				<div>
					<span className="text-tw-text-muted">Repos: </span>
					<span className="text-tw-text-secondary">{data.publicRepos as number}</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Followers: </span>
					<span className="text-tw-text-secondary">{data.followers as number}</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Tripwire events: </span>
					<span className="text-tw-text-secondary">
						{data.tripwireEventCount as number}
					</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Status: </span>
					<span className="text-tw-text-secondary">
						{data.isBlacklisted
							? "Blacklisted"
							: data.isWhitelisted
								? "Whitelisted"
								: "Normal"}
					</span>
				</div>
			</div>
		</div>
	);
}

// ─── Events List Card ────────────────────────────────────────

function EventsListCard({ events }: { events: Array<Record<string, unknown>> }) {
	if (events.length === 0) {
		return (
			<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
				No events found.
			</div>
		);
	}

	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
				Recent Events
			</div>
			<div className="space-y-1.5">
				{events.slice(0, 5).map((event, i) => (
					<div key={i} className="flex items-center gap-2 text-[12px]">
						<span
							className={`size-1.5 rounded-full ${
								event.severity === "error"
									? "bg-tw-error"
									: event.severity === "warning"
										? "bg-tw-warning"
										: "bg-tw-text-muted"
							}`}
						/>
						<span className="text-tw-text-secondary truncate">
							{event.description as string}
						</span>
					</div>
				))}
			</div>
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
			<span className="w-3.5 h-3.5 rounded-full bg-[#3a3a3e]" />
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

function getTextContent(message: UIMessage): string {
	// Extract text from parts
	const textPart = message.parts?.find((p) => p.type === "text");
	if (textPart && textPart.type === "text") {
		return textPart.content;
	}
	return "";
}

function formatToolName(toolName: string): string {
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

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className={className}
		>
			<path
				d="M2.5 6L5 8.5L9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className={className}
		>
			<path
				d="M3 3L9 9M9 3L3 9"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
			/>
		</svg>
	);
}
