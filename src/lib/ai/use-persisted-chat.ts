import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useChat, fetchServerSentEvents, type UIMessage } from "@tanstack/ai-react";
import { useMutation } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useCustomer } from "autumn-js/react";
import { useTRPC } from "#/integrations/trpc/react";
import { useRouterState } from "@tanstack/react-router";

interface UsePersistedChatOptions {
	chatId: string;
	initialMessages?: UIMessage[];
	repoId?: string;
}

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

export function usePersistedChat({
	chatId,
	initialMessages,
	repoId,
}: UsePersistedChatOptions) {
	const currentPath = useRouterState({ select: (s) => s.location.pathname });
	const trpc = useTRPC();
	const [chatError, setChatError] = useState<Error | null>(null);
	const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false);

	// Quota check
	const { data: customer, refetch: refetchCustomer } = useCustomer();
	const aiBalance = customer?.balances?.ai_messages;
	const isQuotaExhausted =
		quotaExhaustedByError ||
		(aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited);

	const connection = useMemo(
		() =>
			fetchServerSentEvents("/api/chat", () => ({
				body: {
					repoId,
					conversationId: chatId,
					currentPage: currentPath,
				},
			})),
		[repoId, chatId, currentPath],
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

	// Seed with persisted messages once loaded
	const didSeed = useRef(false);
	useEffect(() => {
		if (initialMessages && initialMessages.length > 0 && !didSeed.current) {
			didSeed.current = true;
			setMessages(initialMessages);
		}
	}, [initialMessages]);

	// Auto-save when AI finishes responding
	const saveMessages = useMutation(
		trpc.chats.saveMessages.mutationOptions(),
	);

	const wasLoading = useRef(false);
	useEffect(() => {
		if (wasLoading.current && !isLoading && messages.length > 0) {
			saveMessages.mutate({
				chatId,
				messages: messages as any[],
				title: extractTitle(messages),
			});
			refetchCustomer();
		}
		wasLoading.current = isLoading;
	}, [isLoading]);

	const sendMessage = useCallback(
		(content: string) => {
			if (!content.trim() || isQuotaExhausted) return;
			setChatError(null);
			sendChatMessage(content);
		},
		[sendChatMessage, isQuotaExhausted],
	);

	const error = chatError || chatHookError || null;

	return {
		chatId,
		messages,
		isLoading,
		error: isQuotaExhausted ? null : error,
		isQuotaExhausted,
		sendMessage,
		addToolApprovalResponse,
		setMessages,
	};
}
