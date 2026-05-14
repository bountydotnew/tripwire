import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { ChatComposer } from "#/components/ask/chat-composer";
import { ChatThread } from "#/components/ask/chat-thread";
import { usePersistedChat } from '#/components/chat/use-persisted-chat';
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";
import type { UIMessage } from "#/types/chat";

export const Route = createFileRoute("/_app/chat/$chatId")({
	component: ChatPage,
});

function ChatPage() {
	const { chatId } = Route.useParams();
	const navigate = useNavigate();
	const { repo } = useWorkspace();
	const trpc = useTRPC();

	// Load conversation from DB
	const convQuery = useQuery(trpc.chats.get.queryOptions({ chatId }));

	// Only use initialMessage from sessionStorage (cleared after use, survives navigation but not refresh)
	const [initialMessage] = useState(() => {
		const key = `tw.chat.init.${chatId}`;
		const msg = sessionStorage.getItem(key);
		if (msg) sessionStorage.removeItem(key);
		return msg;
	});

	const chat = usePersistedChat({
		chatId,
		initialMessages: convQuery.data?.messages as UIMessage[] | undefined,
		repoId: repo?.id,
	});

	// Auto-send initial message (only on first navigation from home, not refresh)
	const didSendInitial = useRef(false);
	useEffect(() => {
		if (
			initialMessage &&
			!didSendInitial.current &&
			!convQuery.isPending &&
			chat.messages.length === 0
		) {
			didSendInitial.current = true;
			chat.sendMessage(initialMessage);
		}
	}, [initialMessage, convQuery.isPending]);

	const title = convQuery.data?.title ?? "New chat";

	return (
		<div className="h-full flex flex-col items-center">
			{/* Header */}
			<div className="w-full max-w-[560px] flex items-center gap-2 px-3 pt-4 pb-2 shrink-0">
				<button
					type="button"
					onClick={() => navigate({ to: "/home" })}
					className="flex items-center justify-center size-7 rounded-lg hover:bg-tw-hover transition-colors"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path
							d="M9 3L5 7L9 11"
							stroke="#9F9FA9"
							strokeWidth="1.5"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
				<span className="text-[13px] font-medium text-tw-text-secondary truncate">
					{title}
				</span>
			</div>

			{/* Chat thread */}
			<div className="flex-1 min-h-0 overflow-auto w-full max-w-[560px] px-3">
				<ChatThread
					messages={chat.messages}
					isLoading={chat.isLoading}
					error={chat.error}
					isQuotaExhausted={chat.isQuotaExhausted}
					respondToToolApproval={(id, approved) =>
						chat.addToolApprovalResponse({ id, approved })
					}
				/>
			</div>

			{/* Input bar */}
			<div className="w-full max-w-[560px] px-3 pb-4 pt-2 shrink-0">
				<ChatComposer
					disabled={chat.isLoading || chat.isQuotaExhausted}
					isLoading={chat.isLoading}
					placeholder={chat.isQuotaExhausted ? "Out of credits" : "Ask anything..."}
					onSend={chat.sendMessage}
				/>
			</div>
		</div>
	);
}
