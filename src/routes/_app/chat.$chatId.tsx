import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import { ChatThread } from "#/components/ask/chat-thread";
import { usePersistedChat } from "#/lib/ai/use-persisted-chat";
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

	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const handleSubmit = () => {
		if (!inputValue.trim() || chat.isLoading || chat.isQuotaExhausted) return;
		chat.sendMessage(inputValue);
		setInputValue("");
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

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

			{/* Input bar — same as home floating bar */}
			<div className="w-full max-w-[560px] px-3 pb-4 pt-2 shrink-0">
				<div className="flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5">
					<div className="flex items-center w-full gap-1.5">
						<input
							ref={inputRef}
							type="text"
							placeholder={
								chat.isQuotaExhausted ? "Out of messages" : "Ask anything..."
							}
							value={inputValue}
							onChange={(e) => setInputValue(e.target.value)}
							onKeyDown={handleKeyDown}
							disabled={chat.isLoading || chat.isQuotaExhausted}
							className="flex-1 h-9 bg-tw-inner rounded-[10px] px-2.5 text-[14px] text-tw-text-primary placeholder:text-tw-text-tertiary outline-none disabled:opacity-50"
						/>
						<button
							type="button"
							className="flex items-center justify-center size-9 rounded-[10px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors"
						>
							<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
								<path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2Z" />
								<path d="M4.5 7A.75.75 0 0 0 3 7a5.001 5.001 0 0 0 4.25 4.944V13.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.556A5.001 5.001 0 0 0 13 7a.75.75 0 0 0-1.5 0 3.5 3.5 0 1 1-7 0Z" />
							</svg>
						</button>
					</div>
					<div className="flex items-center justify-between w-full pt-1.5">
						<div className="flex items-center gap-1">
							<button
								type="button"
								className="flex items-center gap-1 h-7 px-2 rounded-lg text-tw-text-tertiary hover:text-tw-text-secondary hover:bg-tw-hover transition-colors"
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
								</svg>
								<span className="text-[12px]">Add files</span>
							</button>
							<button
								type="button"
								className="flex items-center gap-1 h-7 px-2 rounded-lg text-tw-text-tertiary hover:text-tw-text-secondary hover:bg-tw-hover transition-colors"
							>
								<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
									<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
								</svg>
								<span className="text-[12px]">Add context</span>
							</button>
						</div>
						<button
							type="button"
							onClick={handleSubmit}
							disabled={
								!inputValue.trim() || chat.isLoading || chat.isQuotaExhausted
							}
							className="flex items-center self-stretch px-1.5 rounded-[10px] justify-center gap-1 bg-[#363639] hover:bg-[#404044] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
						>
							<span className="text-[14px] leading-none text-center text-tw-text-primary px-0.5">
								{chat.isLoading ? "..." : "Go"}
							</span>
							<span
								className="flex items-center h-4 rounded-sm justify-center pt-[3px] pb-0 bg-[#222222] px-1"
								style={{ boxShadow: "#0000001A 0px 1px 1px" }}
							>
								<span className="text-[11px] text-center text-tw-text-tertiary leading-none">
									↵
								</span>
							</span>
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}
