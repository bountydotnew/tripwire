import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { ChatComposer } from "#/components/ask/chat-composer";
import { EventGroupCard } from "#/components/home/event-group-card";
import { toastManager } from "#/components/ui/toast";
import type { TripwireEvent, EventAction } from "#/types/home";
import { useAuth } from '@tripwire/auth/components';
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";
import { TripwireMiniLogo } from "#/utils/chat";

export const Route = createFileRoute("/_app/home")({
	component: HomePage,
});

function HomePage() {
	const { user } = useAuth();
	const { repo } = useWorkspace();
	const trpc = useTRPC();
	const navigate = useNavigate();

	// Fetch real events when repo is available
	const digestQuery = useQuery({
		...trpc.events.digest.queryOptions({
			repoId: repo?.id ?? "",
			limit: 48,
			hours: 48,
		}),
		enabled: !!repo?.id,
	});

	const DIGEST_PAGE_SIZE = 8;
	const [visibleCount, setVisibleCount] = useState(DIGEST_PAGE_SIZE);

	// Transform API response to TripwireEvent format for display
	const apiEvents: (TripwireEvent & { _eventId: string })[] =
		digestQuery.data?.groups.map((g) => {
			const event = g.primaryEvent;
			return {
				id: event.id,
				kind: event.action,
				severity: (event.severity || "warning") as "warning" | "error" | "success",
				title: getEventTitle(event.action, event.severity),
				preview: event.description || "",
				users: g.users.filter((u): u is string => u !== null),
				repo: event.repoId,
				ref: event.githubRef || "",
				contentType: event.contentType || "issue",
				createdAt: formatRelativeTime(event.createdAt),
				ruleFired: event.ruleName || null,
				groupKey: g.groupKey,
				action: getEventAction(event.action),
				// Store the actual event ID for navigation
				_eventId: event.id,
			};
		}) ?? [];

	const events = apiEvents;

	// Group events by groupKey
	const groups: Array<{ key: string; items: TripwireEvent[] }> = [];
	const seen = new Map<string, number>();

	for (const e of events) {
		const k = e.groupKey ?? e.id;
		if (!seen.has(k)) {
			seen.set(k, groups.length);
			groups.push({ key: k, items: [] });
		}
		const idx = seen.get(k);
		if (idx !== undefined) {
			groups[idx].items.push(e);
		}
	}

	const handleOpenEvent = (event: TripwireEvent) => {
		// Navigate to event detail page
		const eventId = (event as TripwireEvent & { _eventId?: string })._eventId || event.id;
		// Use type assertion for dynamic route until types are regenerated
		navigate({ to: "/events/$eventId" as const, params: { eventId } } as never);
	};

	const userName = user?.name?.split(" ")[0] || "there";

	return (
		<div className="relative min-h-full pb-[240px]">
			<div className="mt-20 max-w-2xl w-[672px] mx-auto flex flex-col items-start gap-2 px-4">
				{/* Hero section */}
				<div className="flex flex-col items-start rounded-xl py-1 px-2 gap-2 w-full">
					<h1
						className="text-[28px] leading-[36px] text-tw-text-primary m-0"
						style={{
							fontFamily: "'Playfair Display', serif",
							fontWeight: 500,
						}}
					>
						Welcome back, {userName}!
					</h1>
					<p className="text-[16px] leading-[22px] text-[#EEEEEE80] font-normal m-0 w-full whitespace-nowrap">
						{digestQuery.data?.totalEvents ?? 0} events in the last 48 hours
					</p>
				</div>

				{/* Loading state */}
				{repo && digestQuery.isPending && (
					<div className="w-full flex items-center justify-center py-8">
						<div className="w-5 h-5 border-2 border-tw-text-tertiary border-t-tw-accent rounded-full animate-spin" />
					</div>
				)}

				{/* Event groups */}
				{!digestQuery.isPending && (
					<div className="w-full flex flex-col items-start gap-3 mt-1">
						{groups.slice(0, visibleCount).map((g, i) => (
							<motion.div
								key={g.key}
								initial={{ opacity: 0, y: 4 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{
									duration: 0.25,
									delay: i >= visibleCount - DIGEST_PAGE_SIZE
										? Math.min((i % DIGEST_PAGE_SIZE) * 0.025, 0.18)
										: 0,
									ease: [0.19, 1, 0.22, 1],
								}}
								className="w-full"
							>
								<EventGroupCard
									group={g}
									onOpenEvent={handleOpenEvent}
								/>
							</motion.div>
						))}
					</div>
				)}

				{!digestQuery.isPending && groups.length > visibleCount && (
					<button
						type="button"
						onClick={() => setVisibleCount((c) => c + DIGEST_PAGE_SIZE)}
						className="mt-2 mx-auto text-center text-[12px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors self-center"
					>
						Show {Math.min(DIGEST_PAGE_SIZE, groups.length - visibleCount)} more
					</button>
				)}

				{/* Empty state */}
				{!digestQuery.isPending && groups.length === 0 && repo && (
					<div className="w-full text-center py-12 text-tw-text-muted">
						<p className="text-[15px]">No flagged events in the last 48 hours</p>
						<p className="text-[13px] mt-1">
							Everything is running smoothly on {repo.name}
						</p>
					</div>
				)}

				{groups.length > 0 && (
					<button
						type="button"
						onClick={() => navigate({ to: "/events" })}
						className="mt-3 mx-auto text-center text-[12px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors self-center"
					>
						View all events →
					</button>
				)}

				{/* Recent chats */}
				<RecentChats />
			</div>

			{/* Floating Ask bar */}
			<HomeFloatingBar />
		</div>
	);
}

function HomeFloatingBar() {
	const [previewChat, setPreviewChat] = useState<{
		id: string;
		message: string;
		processing: boolean;
	} | null>(null);
	const navigate = useNavigate();
	const { repo } = useWorkspace();
	const trpc = useTRPC();
	const createChat = useMutation(trpc.chats.create.mutationOptions());

	const handleSubmit = async (message: string) => {
		const trimmedMessage = message.trim();
		if (!trimmedMessage) return;
		const chatId = crypto.randomUUID();

		try {
			await createChat.mutateAsync({ id: chatId, repoId: repo?.id });
			setPreviewChat({ id: chatId, message: trimmedMessage, processing: true });
		} catch (err) {
			setPreviewChat(null);
			toastManager.add({
				type: "error",
				title: "Failed to start chat",
				description: err instanceof Error ? err.message : "Please try again.",
			});
		}
	};

	const handleGoToChat = () => {
		if (!previewChat) return;
		// Store initial message in sessionStorage (cleared on read, doesn't survive refresh)
		sessionStorage.setItem(`tw.chat.init.${previewChat.id}`, previewChat.message);
		navigate({
			to: "/chat/$chatId",
			params: { chatId: previewChat.id },
		});
	};

	return (
		<div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 w-[560px] max-w-[calc(100%-32px)]">
			{/* New Chat Preview */}
			<AnimatePresence>
				{previewChat && (
					<motion.div
						initial={{ y: 20, opacity: 0 }}
						animate={{ y: 0, opacity: 1 }}
						exit={{ y: 10, opacity: 0 }}
						transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
						className="flex items-center justify-between w-full rounded-2xl bg-tw-card p-1.5 pl-3 backdrop-blur-sm"
						style={{
							boxShadow: "0 1px 1px #0000001A",
						}}
					>
						<div className="flex items-center gap-2 min-w-0 flex-1">
							<span className={previewChat.processing ? "animate-spin" : ""}>
								<TripwireMiniLogo size={16} />
							</span>
							<span className="text-[14px] text-[#EEEEEE] truncate">
								{previewChat.message}
							</span>
						</div>
						<button
							type="button"
							onClick={handleGoToChat}
							className="shrink-0 flex items-center h-7 px-3 rounded-[10px] bg-[#363639] text-[14px] text-[#EEEEEE] hover:bg-[#404044] transition-colors ml-2"
						>
							Go to chat
						</button>
					</motion.div>
				)}
			</AnimatePresence>

			{/* Input bar */}
			<ChatComposer
				className="w-full shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]"
				disabled={createChat.isPending}
				isLoading={createChat.isPending}
				placeholder="Ask anything..."
				onSend={(message) => {
					void handleSubmit(message);
				}}
				contextActionAdornment={
					<span className="ml-0.5 flex items-center pr-2">
						<IntegrationChip fill="#533AFD" kind="figma" />
						<IntegrationChip fill="#5E6AD2" kind="linear" />
						<IntegrationChip fill="#000000" kind="github" />
					</span>
				}
			/>
		</div>
	);
}

function RecentChats() {
	const trpc = useTRPC();
	const chatsQuery = useQuery(trpc.chats.list.queryOptions({ limit: 5 }));
	const chats = chatsQuery.data ?? [];

	if (chats.length === 0) return null;

	return (
		<div className="w-full mt-8">
			<h2 className="text-[13px] font-medium text-tw-text-muted uppercase tracking-wider mb-2 px-2">
				Recent chats
			</h2>
			<div className="flex flex-col gap-0.5">
				{chats.map((chat) => (
					<Link
						key={chat.id}
						to="/chat/$chatId"
						params={{ chatId: chat.id }}
						className="flex items-center justify-between rounded-lg px-2 py-2 hover:bg-tw-hover transition-colors group"
					>
						<div className="flex items-center gap-2 min-w-0">
							<TripwireMiniLogo size={12} />
							<span className="text-[13px] text-tw-text-secondary truncate group-hover:text-tw-text-primary transition-colors">
								{chat.title ?? "New chat"}
							</span>
						</div>
						<span className="text-[11px] text-tw-text-muted shrink-0 ml-3">
							{formatRelativeTime(new Date(chat.updatedAt))}
						</span>
					</Link>
				))}
			</div>
		</div>
	);
}

// Helper functions

function getEventTitle(action: string, severity: string | null): string {
	const titles: Record<string, string> = {
		pipeline_blocked: "Blocked",
		pipeline_allowed: "Allowed",
		rule_near_miss: "Near miss",
		blacklist_blocked: "Blacklisted user blocked",
		whitelist_bypass: "Whitelist bypass",
		pr_closed: "PR closed",
		issue_closed: "Issue closed",
		comment_deleted: "Comment deleted",
	};
	let title = titles[action] || "Event";
	if (severity === "error") title = `Blocked — ${title.toLowerCase()}`;
	if (severity === "warning" && action !== "rule_near_miss") title = `Suspected spam`;
	return title;
}

function getEventAction(action: string): EventAction | null {
	const actions: Record<string, EventAction> = {
		pipeline_blocked: { label: "Review", kind: "review" },
		rule_near_miss: { label: "Review", kind: "review" },
		pr_closed: { label: "View PR", kind: "view" },
		issue_closed: { label: "Close issue", kind: "close" },
	};
	return actions[action] || null;
}

function formatRelativeTime(date: Date): string {
	const now = new Date();
	const diff = now.getTime() - date.getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	return `${days}d ago`;
}

interface IntegrationChipProps {
	fill: string;
	kind: "figma" | "linear" | "github";
}

function IntegrationChip({ fill, kind }: IntegrationChipProps) {
	const label = kind === "figma" ? "F" : kind === "linear" ? "L" : "G";
	return (
		<span
			className="inline-flex items-center justify-center rounded-[4px] overflow-hidden shrink-0"
			style={{
				width: 16,
				height: 16,
				marginRight: -8,
				boxShadow: "#313131 0px 0px 0px 2px",
				background: fill,
			}}
		>
			<span className="text-white text-[9px] font-bold leading-none">
				{label}
			</span>
		</span>
	);
}
