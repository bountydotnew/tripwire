import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TopNav } from "#/components/layout/top-nav";
import { WorkspaceRedirect } from "#/components/layout/workspace-redirect";
import { WorkspaceProvider, useWorkspace } from "#/lib/workspace-context";
import { AuthProvider } from '@tripwire/auth/components';
import { ChatProvider, useAIChat } from '#/components/chat/chat-context';
import { ChatInput } from "#/components/chat/chat-input";
import { ChatThread } from "#/components/chat/chat-thread";
import { useTRPC } from "#/integrations/trpc/react";
import { UnicodeSpinner } from "#/components/ui/unicode-spinner";
import { useCustomer } from "autumn-js/react";
import { useRequestNotifications } from "#/lib/use-request-notifications";
import Dither from "#/components/Dither";
import type { UIMessage } from "#/types/chat";

export function AppShell() {
	return (
		<AuthProvider>
			<WorkspaceProvider>
				<ChatProvider>
					<AppShellInner />
				</ChatProvider>
			</WorkspaceProvider>
		</AuthProvider>
	);
}

function AppShellInner() {
	useRequestNotifications();

	const { isOpen, toggle, close, sendMessage, isLoading, isQuotaExhausted, newChat } = useAIChat();
	const [inputValue, setInputValue] = useState("");

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const isHomePage = currentPath === "/home" || currentPath === "/" || currentPath.endsWith("/home");
	const isChatRoute = currentPath.startsWith("/chat/");

	const showSidePanel = !isHomePage && !isChatRoute && isOpen;

	const handleSubmit = () => {
		if (!inputValue.trim() || isLoading) return;
		sendMessage(inputValue);
		setInputValue("");
	};

	return (
		<div className="h-screen flex flex-col overflow-hidden bg-tw-bg tw-root antialiased">
			<WorkspaceRedirect />
			<TopNav askOpen={isOpen} onToggleAsk={toggle} />
			<div className={`flex-1 min-h-0 flex gap-2 ${isChatRoute ? "" : "px-2 pb-2"}`}>
				<div
					className={`flex-1 min-w-0 relative ${isChatRoute ? "" : "tw-inset"}`}
					style={isChatRoute ? undefined : { boxShadow: "#00000008 0px 1px 4px" }}
				>
					<div className="absolute inset-0 overflow-auto">
						<Outlet />
					</div>
				</div>

				<aside
					className="shrink-0 tw-inset transition-all duration-[360ms]"
					style={{
						width: showSidePanel ? 380 : 0,
						marginRight: showSidePanel ? 0 : -8,
						opacity: showSidePanel ? 1 : 0,
						transform: showSidePanel ? "translateX(0)" : "translateX(24px)",
						transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)",
					}}
				>
					{showSidePanel && (
						<div className="h-full w-full flex flex-col relative">
							{/* Dither background at the bottom with upward fade */}
							<div
								className="pointer-events-none absolute inset-x-0 bottom-0 h-[350px] z-0"
								style={{
									maskImage: "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
									WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
								}}
							>
								<Dither
									waveColor={[0.4627450980392157, 0.4627450980392157, 0.4627450980392157]}
									disableAnimation={false}
									enableMouseInteraction={false}
									mouseRadius={0.1}
									colorNum={4}
									pixelSize={2}
									waveAmplitude={0.25}
									waveFrequency={3}
									waveSpeed={0.1}
								/>
							</div>

							<div className="flex items-center justify-between pl-3 pr-2 pt-3 pb-2 shrink-0 relative z-10">
								<div className="flex items-center gap-2 min-w-0">
									<svg
										viewBox="0 0 610.08 589.32"
										width="18"
										height="18"
										fill="#B4B4B4"
										preserveAspectRatio="none"
									>
										<path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
										<circle cx="305.04" cy="90.37" r="90.37" />
									</svg>
									<span className="text-[14px] leading-none text-tw-text-primary font-medium">
										Ask Tripwire
									</span>
								</div>
								<div className="flex items-center gap-1.5">
									<CreditBalancePill />
									<button
										onClick={newChat}
										type="button"
										className="flex items-center justify-center size-6 rounded-md hover:bg-tw-hover transition-colors"
										title="New chat"
									>
										<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
											<path
												d="M7 3v8M3 7h8"
												stroke="#9F9FA9"
												strokeWidth="1.5"
												strokeLinecap="round"
											/>
										</svg>
									</button>
									<button
										onClick={close}
										type="button"
										className="flex items-center justify-center size-6 rounded-md hover:bg-tw-hover transition-colors"
									>
										<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
											<path
												d="M11 3L3 11M3 3L11 11"
												stroke="#9F9FA9"
												strokeWidth="1.5"
												strokeLinecap="round"
											/>
										</svg>
									</button>
								</div>
							</div>

							<div className="px-3 pb-3 shrink-0 relative z-10">
								<p className="text-[13px] leading-[19px] text-tw-text-secondary">
									Ask about anything in your digest, or get help investigating a
									flagged contributor.
								</p>
							</div>

							<div className="flex-1 min-h-0 overflow-auto px-2 pb-2 relative z-10">
								<ChatThread />
							</div>

							<div className="relative z-10">
								<SidebarRecentChats />
							</div>

							<div className="px-2 pb-2 shrink-0 relative z-10">
								<ChatInput
									value={inputValue}
									onChange={setInputValue}
									onSubmit={handleSubmit}
									isLoading={isLoading}
									isDisabled={isQuotaExhausted}
									placeholder={isQuotaExhausted ? "Out of credits" : "Ask anything..."}
									actions={
										<>
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
										</>
									}
								/>
							</div>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}

function CreditBalancePill() {
	const { data: customer } = useCustomer();
	const balance = customer?.balances?.ai_credits;

	if (!balance) return null;

	const remaining = balance.remaining ?? 0;
	const granted = balance.granted ?? 0;
	const unlimited = balance.unlimited ?? false;

	if (unlimited) return null;

	const isEmpty = remaining <= 0;
	const isLow = !isEmpty && granted > 0 && remaining / granted < 0.2;

	return (
		<span
			className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums transition-colors ${
				isEmpty
					? "bg-red-500/10 text-red-400"
					: isLow
						? "bg-amber-500/10 text-amber-400"
						: "bg-[#FAFAFA08] text-tw-text-muted"
			}`}
		>
			${(remaining / 100).toFixed(2)}
		</span>
	);
}

function SidebarRecentChats() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { loadChat, open } = useAIChat();
	const [loadingId, setLoadingId] = useState<string | null>(null);
	const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
	const chatsQuery = useQuery(trpc.chats.list.queryOptions({ limit: 3 }));
	const chats = chatsQuery.data ?? [];

	const listQueryKey = trpc.chats.list.queryKey({ limit: 3 });
	const deleteChat = useMutation(
		trpc.chats.delete.mutationOptions({
			onMutate: async ({ chatId }) => {
				setConfirmDeleteId(null);
				await queryClient.cancelQueries({ queryKey: listQueryKey });
				const previous = queryClient.getQueryData(listQueryKey);
				await new Promise((r) => setTimeout(r, 300));
				queryClient.setQueryData(listQueryKey, (old: typeof chats | undefined) =>
					old ? old.filter((c) => c.id !== chatId) : [],
				);
				return { previous };
			},
			onError: (_err, _vars, ctx) => {
				if (ctx?.previous) {
					queryClient.setQueryData(listQueryKey, ctx.previous);
				}
			},
			onSettled: () => {
				queryClient.invalidateQueries({ queryKey: listQueryKey });
			},
		}),
	);

	const handleLoadChat = async (chatId: string) => {
		setLoadingId(chatId);
		try {
			const conv = await queryClient.fetchQuery(
				trpc.chats.get.queryOptions({ chatId }),
			);
			if (conv?.messages) {
				loadChat(chatId, conv.messages as UIMessage[]);
				open();
			}
		} finally {
			setLoadingId(null);
		}
	};

	if (chats.length === 0) return null;

	return (
		<div className="px-2 pb-1 shrink-0">
			<div className="flex items-center justify-between px-1 mb-1">
				<span className="text-[11px] font-medium text-tw-text-muted uppercase tracking-wider">
					Recent
				</span>
			</div>
			<AnimatePresence initial={false}>
				{chats.map((chat) => {
					const isLoading = loadingId === chat.id;
					const isConfirming = confirmDeleteId === chat.id;

					if (isConfirming) {
						return (
							<motion.div
								key={chat.id}
								layout
								transition={{ layout: { duration: 0.25, ease: [0.25, 1, 0.5, 1] } }}
								className="flex items-center gap-2 w-full px-1.5 py-1.5 rounded-lg bg-tw-hover"
							>
								<span className="text-[12px] text-tw-text-secondary flex-1 truncate">
									Delete this chat?
								</span>
								<button
									type="button"
									onClick={() => deleteChat.mutate({ chatId: chat.id })}
									className="text-[11px] font-medium text-red-400 hover:text-red-300 transition-colors px-1"
								>
									Delete
								</button>
								<button
									type="button"
									onClick={() => setConfirmDeleteId(null)}
									className="text-[11px] font-medium text-tw-text-muted hover:text-tw-text-secondary transition-colors px-1"
								>
									Cancel
								</button>
							</motion.div>
						);
					}

					return (
						<motion.div
							key={chat.id}
							layout
							exit={{ opacity: 0, height: 0, marginTop: 0, marginBottom: 0, overflow: "hidden" }}
							transition={{
								layout: { duration: 0.25, ease: [0.25, 1, 0.5, 1] },
								exit: { duration: 0.2, ease: [0.25, 1, 0.5, 1] },
							}}
							className={`group flex items-center gap-2 w-full px-1.5 py-1.5 rounded-lg text-left ${
								isLoading
									? "bg-tw-hover"
									: "hover:bg-tw-hover"
							}`}
						>
							<button
								type="button"
								disabled={loadingId !== null}
								onClick={() => handleLoadChat(chat.id)}
								className="flex items-center gap-2 flex-1 min-w-0 disabled:opacity-50"
							>
								{isLoading ? (
									<UnicodeSpinner variant="dots" className="text-[12px] text-tw-text-secondary" label="Loading chat" />
								) : (
									<svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="shrink-0 text-tw-text-muted">
										<path d="M2.5 3.5C2.5 2.67 3.17 2 4 2h4c.83 0 1.5.67 1.5 1.5v3c0 .83-.67 1.5-1.5 1.5H5.5L3.5 10V8H4c-.83 0-1.5-.67-1.5-1.5v-3Z" stroke="currentColor" strokeWidth="1" />
									</svg>
								)}
								<span className={`text-[12px] truncate transition-colors duration-200 ${
									isLoading ? "text-tw-text-primary" : "text-tw-text-secondary"
								}`}>
									{chat.title ?? "New chat"}
								</span>
							</button>
							<button
								type="button"
								onClick={(e) => {
									e.stopPropagation();
									setConfirmDeleteId(chat.id);
								}}
								className="shrink-0 flex items-center justify-center size-5 rounded-md opacity-0 group-hover:opacity-100 hover:bg-[#FAFAFA10] transition-all"
							>
								<svg width="10" height="10" viewBox="0 0 10 10" fill="none">
									<path d="M7.5 2.5L2.5 7.5M2.5 2.5L7.5 7.5" stroke="#9F9FA9" strokeWidth="1.2" strokeLinecap="round" />
								</svg>
							</button>
						</motion.div>
					);
				})}
			</AnimatePresence>
		</div>
	);
}
