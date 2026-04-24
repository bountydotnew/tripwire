import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { EventGroupCard } from "#/components/home/event-group-card";
import { type TripwireEvent, type EventAction, EVENTS_BUSY } from "#/components/home/mock-data";
import { useAuth } from "#/lib/auth-context";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";

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
			limit: 10,
			hours: 48,
		}),
		enabled: !!repo?.id,
	});

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

	// Use real events if available, otherwise fall back to mock data
	const events = apiEvents.length > 0 ? apiEvents : EVENTS_BUSY;
	const isUsingMockData = apiEvents.length === 0;

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
						{isUsingMockData
							? "Here's what you missed while you were gone"
							: `${digestQuery.data?.totalEvents ?? 0} events in the last 48 hours`}
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
						{groups.map((g) => (
							<EventGroupCard
								key={g.key}
								group={g}
								onOpenEvent={handleOpenEvent}
							/>
						))}
					</div>
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

				{/* More events link */}
				{groups.length > 0 && (
					<button
						type="button"
						onClick={() => navigate({ to: "/events" })}
						className="mt-3 mx-auto text-center text-[12px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors self-center"
					>
						{isUsingMockData
							? "+ 18 more events today - see all"
							: `View all events →`}
					</button>
				)}
			</div>

			{/* Floating Ask bar */}
			<div className="fixed left-1/2 bottom-6 -translate-x-1/2 z-30 flex flex-col items-center gap-1.5 w-[560px] max-w-[calc(100%-32px)]">
				<div
					className="flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5 w-full"
					style={{
						boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a",
					}}
				>
					<div className="flex items-center w-full gap-1.5">
						<input
							type="text"
							placeholder="Ask anything..."
							className="flex-1 h-9 bg-tw-inner rounded-[10px] px-2.5 text-[14px] text-tw-text-primary placeholder:text-tw-text-tertiary outline-none"
						/>
						<button
							type="button"
							className="flex items-center justify-center size-9 rounded-[10px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors"
						>
							<svg
								width="16"
								height="16"
								viewBox="0 0 16 16"
								fill="currentColor"
							>
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
								<svg
									width="16"
									height="16"
									viewBox="0 0 16 16"
									fill="currentColor"
								>
									<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
								</svg>
								<span className="text-[12px]">Add files</span>
							</button>
							<button
								type="button"
								className="flex items-center gap-1 h-7 px-2 rounded-lg text-tw-text-tertiary hover:text-tw-text-secondary hover:bg-tw-hover transition-colors"
							>
								<svg
									width="16"
									height="16"
									viewBox="0 0 16 16"
									fill="currentColor"
								>
									<path d="M8.75 3.75a.75.75 0 0 0-1.5 0v3.5h-3.5a.75.75 0 0 0 0 1.5h3.5v3.5a.75.75 0 0 0 1.5 0v-3.5h3.5a.75.75 0 0 0 0-1.5h-3.5v-3.5Z" />
								</svg>
								<span className="text-[12px]">Add context</span>
								<span className="flex items-center pr-2 ml-0.5">
									<IntegrationChip fill="#533AFD" kind="figma" />
									<IntegrationChip fill="#5E6AD2" kind="linear" />
									<IntegrationChip fill="#000000" kind="github" />
								</span>
							</button>
						</div>
						<button
							type="button"
							className="flex items-center self-stretch px-1.5 rounded-[10px] justify-center gap-1 bg-[#363639] hover:bg-[#404044] transition-colors"
						>
							<span className="text-[14px] leading-none text-center text-tw-text-primary px-0.5">
								Go
							</span>
							<span
								className="flex items-center h-4 rounded-sm justify-center pt-[3px] pb-0 bg-[#222222] px-1"
								style={{ boxShadow: "#0000001A 0px 1px 1px" }}
							>
								<span className="text-[11px] text-center text-tw-text-tertiary leading-none">
									{"\u21B5"}
								</span>
							</span>
						</button>
					</div>
				</div>
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
