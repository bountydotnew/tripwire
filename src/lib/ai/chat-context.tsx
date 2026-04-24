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

// ─── Types ───────────────────────────────────────────────────

interface PendingApproval {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
}

interface ChatContextValue {
	// State
	messages: UIMessage[];
	isLoading: boolean;
	canSend: boolean;
	isOpen: boolean;
	pendingApproval: PendingApproval | null;
	error: Error | null;

	// Actions
	sendMessage: (content: string) => void;
	approveToolCall: (approved: boolean) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
	clearChat: () => void;
}

// Default no-op context for SSR
const defaultContextValue: ChatContextValue = {
	messages: [],
	isLoading: false,
	canSend: false,
	isOpen: false,
	pendingApproval: null,
	error: null,
	sendMessage: () => {},
	approveToolCall: () => {},
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
	const { repo } = useWorkspace();
	const [isOpen, setIsOpen] = useState(() => {
		return localStorage.getItem("tw.askOpen") === "true";
	});
	const [pendingApproval, setPendingApproval] = useState<PendingApproval | null>(
		null,
	);
	const [chatError, setChatError] = useState<Error | null>(null);

	// Generate unique conversation ID per session
	const [conversationId] = useState(() => crypto.randomUUID());

	// Create connection adapter with dynamic body
	// The body callback is called at request time, so repo?.id will be current
	const connection = useMemo(
		() =>
			fetchServerSentEvents("/api/chat", () => {
				if (!repo?.id) {
					throw new Error("Please select a repository first");
				}

				return {
					body: {
						repoId: repo.id,
						conversationId,
					},
				};
			}),
		[repo?.id, conversationId],
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
			if (!content.trim()) return;
			if (!repo?.id) {
				setChatError(new Error("Please select a repository first"));
				return;
			}
			setChatError(null);
			sendChatMessage(content);
		},
		[sendChatMessage, repo?.id],
	);

	const canSend = Boolean(repo?.id);

	const approveToolCall = useCallback(
		async (approved: boolean) => {
			if (!pendingApproval) return;

			await addToolApprovalResponse({
				id: pendingApproval.toolCallId,
				approved,
			});

			setPendingApproval(null);
		},
		[pendingApproval, addToolApprovalResponse],
	);

	const clearChat = useCallback(() => {
		setMessages([]);
		setPendingApproval(null);
		setChatError(null);
	}, [setMessages]);

	const value: ChatContextValue = {
		messages,
		isLoading,
		canSend,
		isOpen,
		pendingApproval,
		error: combinedError,
		sendMessage,
		approveToolCall,
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
