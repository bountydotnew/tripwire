import { useState, useRef, type KeyboardEvent } from "react";
import { Outlet, useRouterState } from "@tanstack/react-router";
import { TopNav } from "./top-nav";
import { WorkspaceProvider } from "#/lib/workspace-context";
import { AuthProvider } from "#/lib/auth-context";
import { ChatProvider, useAIChat } from "#/lib/ai/chat-context";
import { ChatThread } from "../ask/chat-thread";

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
	const { isOpen, toggle, close, sendMessage, isLoading, isQuotaExhausted } = useAIChat();
	const [inputValue, setInputValue] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;
	const isHomePage = currentPath === "/home" || currentPath === "/";

	const showSidePanel = !isHomePage && isOpen;

	const handleSubmit = () => {
		if (!inputValue.trim() || isLoading || isQuotaExhausted) return;
		sendMessage(inputValue);
		setInputValue("");
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleSubmit();
		}
	};

	return (
		<div className="h-screen flex flex-col overflow-hidden bg-tw-bg tw-root antialiased">
			<TopNav askOpen={isOpen} onToggleAsk={toggle} />
			<div className="flex-1 min-h-0 px-2 pb-2 flex gap-2">
				<div
					className="flex-1 min-w-0 relative tw-inset"
					style={{ boxShadow: "#00000008 0px 1px 4px" }}
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
						<div className="h-full w-full flex flex-col">
							<div className="flex items-center justify-between pl-3 pr-2 pt-3 pb-2 shrink-0">
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

							<div className="px-3 pb-3 shrink-0">
								<p className="text-[13px] leading-[19px] text-tw-text-secondary">
									Ask about anything in your digest, or get help investigating a
									flagged contributor.
								</p>
							</div>

							<div className="flex-1 min-h-0 overflow-auto px-2 pb-2">
								<ChatThread />
							</div>

							<div className="px-2 pb-2 shrink-0">
								<div className="flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5">
									<div className="flex items-center w-full gap-1.5">
										<input
											ref={inputRef}
											type="text"
											placeholder={isQuotaExhausted ? "Out of messages" : "Ask anything..."}
											value={inputValue}
											onChange={(e) => setInputValue(e.target.value)}
											onKeyDown={handleKeyDown}
											disabled={isLoading || isQuotaExhausted}
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
											disabled={!inputValue.trim() || isLoading || isQuotaExhausted}
											className="flex items-center self-stretch px-1.5 rounded-[10px] justify-center gap-1 bg-[#363639] hover:bg-[#404044] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
										>
											<span className="text-[14px] leading-none text-center text-tw-text-primary px-0.5">
												{isLoading ? "..." : "Go"}
											</span>
											<span
												className="flex items-center h-4 rounded-sm justify-center pt-[3px] pb-0 bg-[#222222] px-1"
												style={{ boxShadow: "#0000001A 0px 1px 1px" }}
											>
												<span className="text-[11px] text-center text-tw-text-tertiary leading-none">↵</span>
											</span>
										</button>
									</div>
								</div>
							</div>
						</div>
					)}
				</aside>
			</div>
		</div>
	);
}
