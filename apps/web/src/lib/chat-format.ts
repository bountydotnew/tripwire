import type { UIMessage, MessagePart } from "@tanstack/ai-client";
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
		// not valid JSON
	}
	return null;
}

interface ApprovalText {
	text: string;
	yesLabel: string;
	noLabel: string;
}

export function getApprovalText(toolName: string, username?: string): ApprovalText {
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

interface BatchApprovalText {
	prefix: string;
	suffix: string;
	consequence: string | null;
	buttonLabel: string;
}

export function getBatchApprovalText(action: string): BatchApprovalText {
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
