import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useEffect,
	useRef,
	type ReactNode,
} from "react";
import {
	useChat,
	fetchServerSentEvents,
	type UIMessage,
} from "@tanstack/ai-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useRouterState } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { useTRPC } from "#/integrations/trpc/react";

// ─── Types ───────────────────────────────────────────────────

interface ChatContextValue {
	// State
	messages: UIMessage[];
	isLoading: boolean;
	isOpen: boolean;
	error: Error | null;
	isQuotaExhausted: boolean;
	conversationId: string;

	// Actions
	sendMessage: (content: string) => void;
	respondToToolApproval: (approvalId: string, approved: boolean) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
	clearChat: () => void;
	loadChat: (chatId: string, messages: UIMessage[]) => void;
	newChat: () => void;
}

// Default no-op context for SSR
const defaultContextValue: ChatContextValue = {
	messages: [],
	isLoading: false,
	isOpen: false,
	error: null,
	isQuotaExhausted: false,
	conversationId: "",
	sendMessage: () => {},
	respondToToolApproval: () => {},
	open: () => {},
	close: () => {},
	toggle: () => {},
	clearChat: () => {},
	loadChat: () => {},
	newChat: () => {},
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

const STORAGE_KEY_CONV = "tw.askConversationId";

function extractTitle(messages: UIMessage[]): string {
	const firstUser = messages.find((m) => m.role === "user");
	if (!firstUser) return "New chat";
	const text =
		firstUser.parts
			?.filter((p: any) => p.type === "text")
			.map((p: any) => p.content)
			.join("") ?? "";
	return text.slice(0, 80) || "New chat";
}

function ChatProviderClient({ children }: ChatProviderProps) {
	const { repo } = useWorkspace();
	const currentPath = useRouterState({ select: (s) => s.location.pathname });
	const trpc = useTRPC();
	const queryClient = useQueryClient();
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

	// Persist conversation ID so it survives reload
	const [conversationId, setConversationId] = useState(() => {
		const stored = localStorage.getItem(STORAGE_KEY_CONV);
		if (stored) return stored;
		const id = crypto.randomUUID();
		localStorage.setItem(STORAGE_KEY_CONV, id);
		return id;
	});

	// Track whether we've created the DB row for this conversation
	const createdConvIds = useRef(new Set<string>());

	// Load persisted conversation on mount / when conversationId changes
	const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId: conversationId }));

	// Create connection adapter with dynamic body
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
			if (error.message.includes("429")) {
				setQuotaExhaustedByError(true);
				refetchCustomer();
				return;
			}
			console.error("[chat]", error.message);
			setChatError(error);
		},
	});

	// Seed with persisted messages once loaded from DB
	const didSeed = useRef<string | null>(null);
	useEffect(() => {
		if (
			convQuery.data?.messages &&
			(convQuery.data.messages as any[]).length > 0 &&
			didSeed.current !== conversationId
		) {
			didSeed.current = conversationId;
			createdConvIds.current.add(conversationId);
			setMessages(convQuery.data.messages as any[]);
		}
	}, [convQuery.data, conversationId]);

	// Create conversation + save on first send, save after AI finishes
	const createConv = useMutation(trpc.chats.create.mutationOptions());
	const saveMessages = useMutation(trpc.chats.saveMessages.mutationOptions());

	const wasLoading = useRef(false);
	useEffect(() => {
		if (wasLoading.current && !isLoading && messages.length > 0) {
			saveMessages.mutate({
				chatId: conversationId,
				messages: messages as any[],
				title: extractTitle(messages),
			});
			queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() });
			refetchCustomer();
		}
		wasLoading.current = isLoading;
	}, [isLoading]);

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

			// Create DB row on first message if we haven't yet
			if (!createdConvIds.current.has(conversationId)) {
				createdConvIds.current.add(conversationId);
				createConv.mutate(
					{ id: conversationId, repoId: repo?.id },
					{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() });
						},
					},
				);
			}

			sendChatMessage(content);
			setTimeout(() => refetchCustomer(), 2000);
		},
		[sendChatMessage, isQuotaExhausted, refetchCustomer, conversationId, repo?.id],
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

	const loadChat = useCallback(
		(chatId: string, msgs: UIMessage[]) => {
			setChatError(null);
			setConversationId(chatId);
			localStorage.setItem(STORAGE_KEY_CONV, chatId);
			didSeed.current = chatId;
			createdConvIds.current.add(chatId);
			setMessages(msgs);
		},
		[setMessages],
	);

	const newChat = useCallback(() => {
		const id = crypto.randomUUID();
		setConversationId(id);
		localStorage.setItem(STORAGE_KEY_CONV, id);
		didSeed.current = null;
		setMessages([]);
		setChatError(null);
	}, [setMessages]);

	const value: ChatContextValue = {
		messages,
		isLoading,
		isOpen,
		error: isQuotaExhausted ? null : combinedError,
		isQuotaExhausted,
		conversationId,
		sendMessage,
		respondToToolApproval,
		open,
		close,
		toggle,
		clearChat,
		loadChat,
		newChat,
	};

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

// ─── Hook ────────────────────────────────────────────────────

export function useAIChat() {
	return useContext(ChatContext);
}
