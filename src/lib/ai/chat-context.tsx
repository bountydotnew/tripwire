import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useEffect,
	type ReactNode,
} from "react";
import {
	useChat,
	fetchServerSentEvents,
	type UIMessage,
} from "@tanstack/ai-react";
import { useWorkspace } from "#/lib/workspace-context";
import { useRouterState } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";

// ─── Types ───────────────────────────────────────────────────

interface ChatContextValue {
	// State
	messages: UIMessage[];
	isLoading: boolean;
	isOpen: boolean;
	error: Error | null;
	isQuotaExhausted: boolean;

	// Actions
	sendMessage: (content: string) => void;
	respondToToolApproval: (approvalId: string, approved: boolean) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
	clearChat: () => void;
}

// Default no-op context for SSR
const defaultContextValue: ChatContextValue = {
	messages: [],
	isLoading: false,
	isOpen: false,
	error: null,
	isQuotaExhausted: false,
	sendMessage: () => {},
	respondToToolApproval: () => {},
	open: () => {},
	close: () => {},
	toggle: () => {},
	clearChat: () => {},
};

const ChatContext = createContext<ChatContextValue>(defaultContextValue);

// ─── Provider ────────────────────────────────────────────────

interface ChatProviderProps {
	children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
	const [isMounted, setIsMounted] = useState(false);

	useEffect(() => {
		setIsMounted(true);
	}, []);

	// During SSR or before hydration, provide default context
	if (!isMounted) {
		return (
			<ChatContext.Provider value={defaultContextValue}>
				{children}
			</ChatContext.Provider>
		);
	}

	// After hydration, use the real chat provider
	return <ChatProviderClient>{children}</ChatProviderClient>;
}

// ─── Client-only Provider ────────────────────────────────────

function ChatProviderClient({ children }: ChatProviderProps) {
	const { repo, org } = useWorkspace();
	const currentPath = useRouterState({ select: (s) => s.location.pathname });
	const [isOpen, setIsOpen] = useState(() => {
		return localStorage.getItem("tw.askOpen") === "true";
	});
	const [chatError, setChatError] = useState<Error | null>(null);
	const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false);

	// Check quota proactively via Autumn's customer data
	const { data: customer, refetch: refetchCustomer } = useCustomer();
	const aiBalance = customer?.balances?.ai_messages;
	const isQuotaExhausted = quotaExhaustedByError
		|| (aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited);

	// Generate unique conversation ID per session
	const [conversationId] = useState(() => crypto.randomUUID());

	// Create connection adapter with dynamic body
	// The body callback is called at request time, so repo?.id will be current
	const connection = useMemo(
		() =>
			fetchServerSentEvents("/api/chat", () => {
				return {
					body: {
						repoId: repo?.id,
						conversationId,
						currentPage: currentPath,
					},
				};
			}),
		[repo?.id, conversationId, currentPath],
	);

	const {
		messages,
		sendMessage: sendChatMessage,
		isLoading,
		addToolApprovalResponse,
		setMessages,
		error: chatHookError,
	} = useChat({
		connection,
		onError: (error) => {
			// Detect quota exhaustion (429 from Autumn billing check)
			if (error.message.includes("429")) {
				setQuotaExhaustedByError(true);
				refetchCustomer();
				return;
			}
			console.error("[chat] Stream error:", error);
			setChatError(error);
		},
	});

	// Combine hook error with our custom error state
	const combinedError = chatError || chatHookError || null;

	// Persist isOpen state
	const updateIsOpen = useCallback((value: boolean) => {
		setIsOpen(value);
		localStorage.setItem("tw.askOpen", String(value));
	}, []);

	const open = useCallback(() => updateIsOpen(true), [updateIsOpen]);
	const close = useCallback(() => updateIsOpen(false), [updateIsOpen]);
	const toggle = useCallback(
		() => updateIsOpen(!isOpen),
		[isOpen, updateIsOpen],
	);

	const sendMessage = useCallback(
		(content: string) => {
			if (!content.trim() || isQuotaExhausted) return;
			setChatError(null);
			sendChatMessage(content);
			// Refetch balance after a delay to account for tracking
			setTimeout(() => refetchCustomer(), 2000);
		},
		[sendChatMessage, isQuotaExhausted, refetchCustomer],
	);

	const respondToToolApproval = useCallback(
		(approvalId: string, approved: boolean) => {
			addToolApprovalResponse({ id: approvalId, approved });
		},
		[addToolApprovalResponse],
	);

	const clearChat = useCallback(() => {
		setMessages([]);
		setChatError(null);
	}, [setMessages]);

	const value: ChatContextValue = {
		messages,
		isLoading,
		isOpen,
		error: isQuotaExhausted ? null : combinedError,
		isQuotaExhausted,
		sendMessage,
		respondToToolApproval,
		open,
		close,
		toggle,
		clearChat,
	};

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────

export function useAIChat() {
	return useContext(ChatContext);
}
