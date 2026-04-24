import type { UIMessage, MessagePart } from "@tanstack/ai-client";
import type { ReactNode } from "react";
import type { ActionResultData } from "#/types/chat";

export function getPartKey(part: MessagePart, messageId: string): string {
	if (part.type === "tool-call") return part.id;
	if (part.type === "tool-result") return `${messageId}-result-${part.toolCallId}`;
	if (part.type === "text") return `${messageId}-text`;
	return `${messageId}-${part.type}`;
}

export function getTextContent(message: UIMessage): string {
	const textPart = message.parts?.find((p) => p.type === "text");
	if (textPart && textPart.type === "text") {
		return textPart.content;
	}
	return "";
}

export function formatToolName(toolName: string | undefined): string {
	if (!toolName) return "tool";
	return toolName.replace(/_/g, " ");
}

export function formatToolArgs(_toolName: string, args: Record<string, unknown>): string {
	if (args.username) return `@${args.username}`;
	if (args.eventId) return args.eventId as string;
	return "";
}

export function parseErrorMessage(message: string): { title: string; detail: string | null } {
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

	return {
		title: "Something went wrong",
		detail: message,
	};
}

export function parseActionResult(content: string): ActionResultData | null {
	try {
		const parsed = JSON.parse(content);
		if (parsed?.root === "main" && parsed?.elements?.main?.type === "ActionResult") {
			const props = parsed.elements.main.props;
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

export function getApprovalText(
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

export function getBatchApprovalText(action: string): {
	prefix: string;
	suffix: string;
	consequence: string | null;
	buttonLabel: string;
} {
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

export function UserMentionChip({ username }: { username: string }) {
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

export function IssueChip({ label, number }: { label: string | null; number: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0">
				<circle cx="8" cy="8" r="5.5" stroke="#B4B4B4" strokeWidth="1.2" />
				<circle cx="8" cy="8" r="1.5" fill="#B4B4B4" />
			</svg>
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium tabular-nums">
				{label ? `${label} ` : ""}#{number}
			</span>
		</span>
	);
}

export function renderInlineText(text: string): ReactNode {
	if (!text) return text;
	const regex = /(@[A-Za-z0-9][A-Za-z0-9_-]*)|((?:PR|Issue|issue)\s+#\d+)|(#\d+)/g;
	const parts: ReactNode[] = [];
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
			const label = rawLabel ? (rawLabel.toLowerCase() === "issue" ? "Issue" : "PR") : null;
			parts.push(<IssueChip key={`i${key++}`} label={label} number={mm?.[2] || ""} />);
		}
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

export function getBriefActionText(action: string, username?: string): ReactNode {
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

export function TripwireMiniLogo({ size = 12 }: { size?: number }) {
	return (
		<svg viewBox="0 0 610.08 589.32" width={size} height={size} fill="#B4B4B4" preserveAspectRatio="none">
			<path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
			<circle cx="305.04" cy="90.37" r="90.37" />
		</svg>
	);
}
