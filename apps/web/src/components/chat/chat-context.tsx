import {
	createContext,
	useContext,
	useState,
	useCallback,
	useMemo,
	useRef,
	type ReactNode,
} from "react";
import {
	useChat,
} from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { UIMessage, SerializedMessage } from "#/types/chat";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useRouterState } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { useTRPC } from "#/integrations/trpc/react";
import { extractChatTitle } from "#/lib/chat-persistence";


interface ChatContextValue {
	// State
	messages: UIMessage[];
	isLoading: boolean;
	isOpen: boolean;
	error: Error | null;
	isQuotaExhausted: boolean;
	conversationId: string;
	repoId: string | undefined;

	// Actions
	sendMessage: (content: string) => void;
	respondToToolApproval: (approvalId: string, approved: boolean) => void;
	open: () => void;
	close: () => void;
	toggle: () => void;
	clearChat: () => void;
	loadChat: (chatId: string, messages: UIMessage[]) => void;
	newChat: () => void;
	appendOptimisticMessage: (message: UIMessage) => void;
	replaceOptimisticMessage: (id: string, message: UIMessage) => void;
}

// Default no-op context for SSR
const defaultContextValue: ChatContextValue = {
	messages: [],
	isLoading: false,
	isOpen: false,
	error: null,
	isQuotaExhausted: false,
	conversationId: "",
	repoId: undefined,
	sendMessage: () => {},
	respondToToolApproval: () => {},
	open: () => {},
	close: () => {},
	toggle: () => {},
	clearChat: () => {},
	loadChat: () => {},
	newChat: () => {},
	appendOptimisticMessage: () => {},
	replaceOptimisticMessage: () => {},
};

const ChatContext = createContext<ChatContextValue>(defaultContextValue);


interface ChatProviderProps {
	children: ReactNode;
}

export function ChatProvider({ children }: ChatProviderProps) {
	return <ChatProviderClient>{children}</ChatProviderClient>;
}


const STORAGE_KEY_CONV = "tw.askConversationId";
const STORAGE_KEY_OPEN = "tw.askOpen";

function getStoredValue(key: string): string | null {
	return typeof window === "undefined" ? null : window.localStorage.getItem(key);
}

function setStoredValue(key: string, value: string): void {
	if (typeof window !== "undefined") {
		window.localStorage.setItem(key, value);
	}
}

function ChatProviderClient({ children }: ChatProviderProps) {
	const { repo, repos, setRepo } = useWorkspace();
	const currentPath = useRouterState({ select: (s) => s.location.pathname });
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [isOpen, setIsOpen] = useState(() => {
		return getStoredValue(STORAGE_KEY_OPEN) === "true";
	});
	const [chatError, setChatError] = useState<Error | null>(null);
	const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false);

	// Check quota proactively via Autumn's customer data
	const { data: customer, refetch: refetchCustomer } = useCustomer();
	const aiBalance = customer?.balances?.ai_credits;
	const isQuotaExhausted = quotaExhaustedByError
		|| (aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited);

	// Persist conversation ID so it survives reload
	const [conversationId, setConversationId] = useState(() => {
		const stored = getStoredValue(STORAGE_KEY_CONV);
		if (stored) return stored;
		const id = crypto.randomUUID();
		setStoredValue(STORAGE_KEY_CONV, id);
		return id;
	});

	// When a persisted chat is loaded, pin to the repoId it was created against
	// so subsequent /api/chat requests target that repo even if the user has
	// since switched workspace. `null` means "fall back to current workspace
	// repo" (legacy conversations with no recorded repoId, or fresh chats).
	const [pinnedRepoId, setPinnedRepoId] = useState<string | null>(null);

	// Track whether we've created the DB row for this conversation
	const createdConvIds = useRef(new Set<string>());

	// Load persisted conversation on mount / when conversationId changes
	const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId: conversationId }));
	const persistedMessages = (convQuery.data?.messages as UIMessage[] | undefined) ?? [];
	const persistedRepoId = convQuery.data?.repoId ?? null;
	const conversationExists = !!convQuery.data;
	const hasPersistedMessages = persistedMessages.length > 0;

	// Resolve the effective repoId we'll send: pinned wins over the live workspace.
	const effectiveRepoId = pinnedRepoId ?? persistedRepoId ?? repo?.id;

	const requestBodyRef = useRef({
		repoId: effectiveRepoId,
		conversationId,
		currentPage: currentPath,
	});
	requestBodyRef.current = {
		repoId: effectiveRepoId,
		conversationId,
		currentPage: currentPath,
	};

	// The AI SDK keeps the Chat instance stable, so keep transport stable too
	// and read request metadata from a ref that updates on every render.
	const transport = useMemo(
		() =>
			new DefaultChatTransport<UIMessage>({
				api: "/api/chat",
				body: () => requestBodyRef.current,
			}),
		[],
	);

	// Create conversation + save when AI finishes.
	const createConv = useMutation(trpc.chats.create.mutationOptions());
	const saveMessages = useMutation(trpc.chats.saveMessages.mutationOptions());

	const {
		messages,
		sendMessage: sendChatMessage,
		status,
		addToolApprovalResponse,
		setMessages,
		error: chatHookError,
	} = useChat<UIMessage>({
		id: hasPersistedMessages
			? `${conversationId}:${convQuery.dataUpdatedAt}`
			: conversationId,
		messages: persistedMessages,
		transport,
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
		onError: (error) => {
			if (error.message.includes("429")) {
				setQuotaExhaustedByError(true);
				refetchCustomer();
				return;
			}
			console.error("[chat]", error.message);
			setChatError(error);
		},
		onFinish: ({ messages }) => {
			if (messages.length === 0) return;
			saveMessages.mutate({
				chatId: conversationId,
				repoId: effectiveRepoId,
				messages: messages as unknown as SerializedMessage[],
				title: extractChatTitle(messages),
			});
			queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() });
			refetchCustomer();
		},
	});
	const isLoading = status === "submitted" || status === "streaming";

	// Combine hook error with our custom error state
	const combinedError = chatError || chatHookError || null;

	// Persist isOpen state
	const updateIsOpen = useCallback((value: boolean) => {
		setIsOpen(value);
		setStoredValue(STORAGE_KEY_OPEN, String(value));
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

			// Create DB row on first message if we haven't yet. Use the pinned
			// repo when loading an existing chat; otherwise fall back to the
			// live workspace repo.
			if (!conversationExists && !createdConvIds.current.has(conversationId)) {
				createdConvIds.current.add(conversationId);
				createConv.mutate(
					{ id: conversationId, repoId: effectiveRepoId },
					{
						onSuccess: () => {
							queryClient.invalidateQueries({ queryKey: trpc.chats.list.queryKey() });
						},
					},
				);
			}

			void sendChatMessage({ text: content });
			setTimeout(() => refetchCustomer(), 2000);
		},
		[conversationExists, sendChatMessage, isQuotaExhausted, refetchCustomer, conversationId, effectiveRepoId],
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
			setStoredValue(STORAGE_KEY_CONV, chatId);
			createdConvIds.current.add(chatId);
			setMessages(msgs);

			// Pin the chat to its stored repo so subsequent sends target that
			// repo even if the user switches workspace. The persisted chat row
			// is fetched via the same trpc.chats.get query the caller already
			// invoked, so it's cached and read synchronously here.
			const cached = queryClient.getQueryData(
				trpc.chats.get.queryKey({ chatId }),
			) as { repoId: string | null } | undefined;
			const storedRepoId = cached?.repoId ?? null;
			if (storedRepoId) {
				setPinnedRepoId(storedRepoId);
				if (repo?.id !== storedRepoId) {
					const target = repos.find((r) => r.id === storedRepoId);
					if (target) setRepo(target);
				}
			} else {
				// Legacy chat with no recorded repo; keep using the live
				// workspace repo (no pinning).
				setPinnedRepoId(null);
			}
		},
		[setMessages, queryClient, trpc.chats.get, repo?.id, repos, setRepo],
	);

	const newChat = useCallback(() => {
		const id = crypto.randomUUID();
		setConversationId(id);
		setStoredValue(STORAGE_KEY_CONV, id);
		setMessages([]);
		setChatError(null);
		// Fresh chats follow the live workspace repo until they're persisted.
		setPinnedRepoId(null);
	}, [setMessages]);

	const appendOptimisticMessage = useCallback(
		(message: UIMessage) => {
			setMessages((prev) => [...prev, message]);
		},
		[setMessages],
	);

	const replaceOptimisticMessage = useCallback(
		(id: string, message: UIMessage) => {
			setMessages((prev) => prev.map((m) => (m.id === id ? message : m)));
		},
		[setMessages],
	);

	const value: ChatContextValue = {
		messages,
		isLoading,
		isOpen,
		error: isQuotaExhausted ? null : combinedError,
		isQuotaExhausted,
		conversationId,
		repoId: effectiveRepoId,
		sendMessage,
		respondToToolApproval,
		open,
		close,
		toggle,
		clearChat,
		loadChat,
		newChat,
		appendOptimisticMessage,
		replaceOptimisticMessage,
	};

	return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}


export function useAIChat() {
	return useContext(ChatContext);
}
