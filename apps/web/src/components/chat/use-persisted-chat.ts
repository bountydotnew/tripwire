import { useState, useMemo, useRef, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithApprovalResponses,
} from "ai";
import type { UIMessage, SerializedMessage } from "#/types/chat";
import { useMutation } from "@tanstack/react-query";
import { useCustomer } from "autumn-js/react";
import { useTRPC } from "#/integrations/trpc/react";
import { useRouterState } from "@tanstack/react-router";
import { extractChatTitle } from "#/lib/chat-persistence";

interface UsePersistedChatOptions {
	chatId: string;
	initialMessages?: UIMessage[];
	initialMessagesVersion?: number;
	repoId?: string;
}

export function usePersistedChat({
	chatId,
	initialMessages,
	initialMessagesVersion,
	repoId,
}: UsePersistedChatOptions) {
	const currentPath = useRouterState({ select: (s) => s.location.pathname });
	const trpc = useTRPC();
	const [chatError, setChatError] = useState<Error | null>(null);
	const [quotaExhaustedByError, setQuotaExhaustedByError] = useState(false);

	// Quota check
	const { data: customer, refetch: refetchCustomer } = useCustomer();
	const aiBalance = customer?.balances?.ai_credits;
	const isQuotaExhausted =
		quotaExhaustedByError ||
		(aiBalance != null && aiBalance.remaining <= 0 && !aiBalance.unlimited);

	const requestBodyRef = useRef({
		repoId,
		conversationId: chatId,
		currentPage: currentPath,
	});
	requestBodyRef.current = {
		repoId,
		conversationId: chatId,
		currentPage: currentPath,
	};

	// Keep the Chat instance's transport stable while still sending fresh
	// repo/page metadata as the workspace context finishes loading.
	const transport = useMemo(
		() =>
			new DefaultChatTransport<UIMessage>({
				api: "/api/chat",
				body: () => requestBodyRef.current,
			}),
		[],
	);

	const saveMessages = useMutation(
		trpc.chats.saveMessages.mutationOptions(),
	);

	const {
		messages,
		sendMessage: sendChatMessage,
		status,
		addToolApprovalResponse,
		setMessages,
		error: chatHookError,
	} = useChat<UIMessage>({
		id: initialMessages && initialMessages.length > 0
			? `${chatId}:${initialMessagesVersion ?? initialMessages.length}`
			: chatId,
		messages: initialMessages ?? [],
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
				chatId,
				repoId,
				messages: messages as unknown as SerializedMessage[],
				title: extractChatTitle(messages),
			});
			refetchCustomer();
		},
	});
	const isLoading = status === "submitted" || status === "streaming";

	const sendMessage = useCallback(
		(content: string) => {
			if (!content.trim() || isQuotaExhausted) return;
			setChatError(null);
			void sendChatMessage({ text: content });
		},
		[sendChatMessage, isQuotaExhausted],
	);

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

	const clearChat = useCallback(() => {
		setMessages([]);
		setChatError(null);
	}, [setMessages]);

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
		appendOptimisticMessage,
		replaceOptimisticMessage,
		clearChat,
		repoId,
	};
}
