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
} from "@tanstack/ai-react";
import type { UIMessage, SerializedMessage } from "#/types/chat";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useRouterState } from "@tanstack/react-router";
import { useCustomer } from "autumn-js/react";
import { useTRPC } from "#/integrations/trpc/react";


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
	const { repo, repos, setRepo } = useWorkspace();
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
	const aiBalance = customer?.balances?.ai_credits;
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

	// When a persisted chat is loaded, pin to the repoId it was created against
	// so subsequent /api/chat requests target that repo even if the user has
	// since switched workspace. `null` means "fall back to current workspace
	// repo" (legacy conversations with no recorded repoId, or fresh chats).
	const [pinnedRepoId, setPinnedRepoId] = useState<string | null>(null);

	// Track whether we've created the DB row for this conversation
	const createdConvIds = useRef(new Set<string>());

	// Load persisted conversation on mount / when conversationId changes
	const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId: conversationId }));

	// Resolve the effective repoId we'll send: pinned wins over the live workspace.
	const effectiveRepoId = pinnedRepoId ?? repo?.id;

	// Create connection adapter with dynamic body
	const connection = useMemo(
		() =>
			fetchServerSentEvents("/api/chat", () => {
				return {
					body: {
						repoId: effectiveRepoId,
						conversationId,
						currentPage: currentPath,
					},
				};
			}),
		[effectiveRepoId, conversationId, currentPath],
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
			(convQuery.data.messages as UIMessage[]).length > 0 &&
			didSeed.current !== conversationId
		) {
			didSeed.current = conversationId;
			createdConvIds.current.add(conversationId);
			setMessages(convQuery.data.messages as UIMessage[]);

			// Pin to the conversation's recorded repo. Legacy rows with a null
			// repoId continue to use the current workspace repo (no pinning).
			const storedRepoId = convQuery.data.repoId ?? null;
			if (storedRepoId) {
				setPinnedRepoId(storedRepoId);
				// Auto-switch the workspace so the rest of the UI reflects the
				// repo the chat will actually operate on. No-op if it already
				// matches or if the user doesn't have that repo in their list.
				if (repo?.id !== storedRepoId) {
					const target = repos.find((r) => r.id === storedRepoId);
					if (target) setRepo(target);
				}
			}
		}
	}, [convQuery.data, conversationId, repo?.id, repos, setRepo]);

	// Create conversation + save on first send, save after AI finishes
	const createConv = useMutation(trpc.chats.create.mutationOptions());
	const saveMessages = useMutation(trpc.chats.saveMessages.mutationOptions());

	const wasLoading = useRef(false);
	useEffect(() => {
		if (wasLoading.current && !isLoading && messages.length > 0) {
			saveMessages.mutate({
				chatId: conversationId,
				messages: messages as SerializedMessage[],
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

			// Create DB row on first message if we haven't yet. Use the pinned
			// repo when loading an existing chat; otherwise fall back to the
			// live workspace repo.
			if (!createdConvIds.current.has(conversationId)) {
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

			sendChatMessage(content);
			setTimeout(() => refetchCustomer(), 2000);
		},
		[sendChatMessage, isQuotaExhausted, refetchCustomer, conversationId, effectiveRepoId],
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
				// Legacy chat with no recorded repo — keep using the live
				// workspace repo (no pinning).
				setPinnedRepoId(null);
			}
		},
		[setMessages, queryClient, trpc.chats.get, repo?.id, repos, setRepo],
	);

	const newChat = useCallback(() => {
		const id = crypto.randomUUID();
		setConversationId(id);
		localStorage.setItem(STORAGE_KEY_CONV, id);
		didSeed.current = null;
		setMessages([]);
		setChatError(null);
		// Fresh chats follow the live workspace repo until they're persisted.
		setPinnedRepoId(null);
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


export function useAIChat() {
	return useContext(ChatContext);
}
