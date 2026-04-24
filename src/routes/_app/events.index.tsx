import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { useTRPC } from "#/integrations/trpc/react";
import { useWorkspace } from "#/lib/workspace-context";
import { EmptyState } from "#/components/layout/empty-state";
import { env } from "#/env";
import { useState, useMemo } from "react";

export const Route = createFileRoute("/_app/events/")({
	component: EventsPage,
	pendingComponent: EventsPageSkeleton,
});

// ─── Types ─────────────────────────────────────────────────────

type Event = {
	id: string;
	repoId: string;
	action: string;
	severity: string | null;
	description: string | null;
	contentType: string | null;
	pipelineId: string | null;
	ruleName: string | null;
	targetGithubUsername: string | null;
	targetGithubUserId: number | null;
	githubRef: string | null;
	metadata: Record<string, unknown> | null;
	createdAt: string | Date;
};

type FilterState = {
	action: string | null;
	username: string;
};

// ─── Config ────────────────────────────────────────────────────

const SEVERITY_DOT: Record<string, string> = {
	success: "bg-tw-success",
	error: "bg-tw-error",
	warning: "bg-tw-warning",
	info: "bg-tw-accent",
};

const ACTION_LABELS: Record<string, string> = {
	pipeline_allowed: "Allowed",
	pipeline_blocked: "Blocked",
	pr_closed: "PR Closed",
	issue_closed: "Issue Closed",
	issue_deleted: "Issue Closed",
	comment_deleted: "Comment Deleted",
	rule_near_miss: "Near Miss",
	whitelist_bypass: "Whitelist Bypass",
	blacklist_blocked: "Blacklist Block",
	rule_config_updated: "Config Updated",
	whitelist_added: "Whitelist +",
	whitelist_removed: "Whitelist −",
	blacklist_added: "Blacklist +",
	blacklist_removed: "Blacklist −",
};

const RULE_NAMES: Record<string, string> = {
	requireProfilePicture: "Profile Picture",
	accountAge: "Account Age",
	minMergedPrs: "Min Merged PRs",
	languageRequirement: "Language",
	aiSlopDetection: "AI Slop Detection",
	maxPrsPerDay: "Max PRs/Day",
	maxFilesChanged: "Max Files Changed",
	repoActivityMinimum: "Repo Activity",
	requireProfileReadme: "Profile README",
	blacklist: "Blacklist",
};

const CONTENT_TYPE_LABELS: Record<string, string> = {
	pull_request: "PR",
	issue: "Issue",
	comment: "Comment",
};

// ─── Helpers ───────────────────────────────────────────────────

function timeAgo(dateStr: string | Date): string {
	const seconds = Math.floor(
		(Date.now() - new Date(dateStr).getTime()) / 1000,
	)
	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	return new Date(dateStr).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
	})
}

// ─── Components ────────────────────────────────────────────────

// Events that don't have useful detail pages
const NON_CLICKABLE_ACTIONS = new Set([
	"rule_config_updated",
	"whitelist_added",
	"whitelist_removed",
	"blacklist_added",
	"blacklist_removed",
]);

function EventRow({ event }: { event: Event }) {
	const dotColor = SEVERITY_DOT[event.severity ?? "info"] ?? SEVERITY_DOT.info;
	const actionLabel = ACTION_LABELS[event.action] ?? event.action;
	const isClickable = !NON_CLICKABLE_ACTIONS.has(event.action);

	const content = (
		<>
			{/* Severity dot */}
			<span className={`size-2 rounded-full shrink-0 ${dotColor}`} />

			{/* Description */}
			<span className="flex-1 min-w-0 text-[13px] font-medium text-white leading-4 tracking-[-0.2px] truncate">
				{event.description || actionLabel}
			</span>

			{/* Tags */}
			<div className="flex items-center gap-1.5 shrink-0">
				{event.ruleName && (
					<span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-[#FFFFFF73] leading-none">
						{RULE_NAMES[event.ruleName] ?? event.ruleName}
					</span>
				)}
				{event.contentType && (
					<span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] font-medium text-[#FFFFFF73] leading-none">
						{CONTENT_TYPE_LABELS[event.contentType] ?? event.contentType}
					</span>
				)}
				{event.githubRef && (
					<span className="text-[11px] font-mono text-[#FFFFFF73] leading-none">
						{event.githubRef}
					</span>
				)}
			</div>

			{/* Username */}
			{event.targetGithubUsername && (
				<div className="flex items-center gap-1.5 shrink-0">
					<img
						src={`https://github.com/${event.targetGithubUsername}.png?size=32`}
						alt=""
						className="size-4 rounded-full"
					/>
					<span className="text-[12px] font-medium text-[#FFFFFF73]">
						{event.targetGithubUsername}
					</span>
				</div>
			)}

			{/* Timestamp */}
			<span className="text-[12px] text-[#FFFFFF59] tabular-nums shrink-0 w-14 text-right">
				{timeAgo(event.createdAt)}
			</span>

			{/* Arrow indicator - only show for clickable rows */}
			{isClickable && (
				<svg
					width="12"
					height="12"
					viewBox="0 0 12 12"
					className="shrink-0 text-[#FFFFFF59]"
				>
					<path
						d="M4.5 3L7.5 6L4.5 9"
						fill="none"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			)}
		</>
	);

	if (!isClickable) {
		return (
			<div className="flex items-center gap-3 w-full px-4 py-2.5">
				{content}
			</div>
		);
	}

	return (
		<Link
			to="/events/$eventId"
			params={{ eventId: event.id }}
			className="flex items-center gap-3 w-full px-4 py-2.5 hover:bg-white/[0.02] transition-colors no-underline cursor-pointer"
		>
			{content}
		</Link>
	);
}

function FilterTab({
	label,
	active,
	count,
	onClick,
}: {
	label: string;
	active: boolean;
	count?: number;
	onClick: () => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={`
				inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-medium
				border-none cursor-pointer transition-colors
				${
					active
						? "bg-white/10 text-white"
						: "bg-transparent text-[#FFFFFF59] hover:text-[#FFFFFF73]"
				}
			`}
		>
			{label}
			{count !== undefined && count > 0 && (
				<span className="text-[11px] text-[#FFFFFF59] tabular-nums">
					{count}
				</span>
			)}
		</button>
	)
}

function EventListSkeleton() {
	return (
		<div className="divide-y divide-white/[0.03]">
			{Array.from({ length: 8 }).map((_, i) => (
				<div
					key={i}
					className="flex items-center gap-3 px-4 py-2.5"
				>
					<div className="size-2 rounded-full bg-white/5" />
					<div className="h-3.5 flex-1 bg-white/5 rounded" />
					<div className="h-3.5 w-12 bg-white/5 rounded" />
				</div>
			))}
		</div>
	)
}

function EventsPageSkeleton() {
	return (
		<div className="flex flex-col py-6 md:py-8 px-4 md:px-[50px] gap-6 max-w-[1000px] mx-auto w-full">
			{/* Header */}
			<div className="flex flex-col gap-0.5">
				<div className="h-7 w-20 bg-white/5 rounded" />
				<div className="h-4 w-56 bg-white/5 rounded" />
			</div>

			{/* Stats bar */}
			<div className="flex flex-wrap rounded-xl overflow-clip bg-tw-card border border-[#0000000F] shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
				{Array.from({ length: 4 }).map((_, i, arr) => (
					<div
						key={i}
						className={`flex flex-col grow min-w-0 pt-2.5 pb-2 px-3 md:px-4 ${i < arr.length - 1 ? "md:border-r md:border-r-[#0000000F]" : ""}`}
					>
						<div className="h-3.5 w-16 bg-white/5 rounded mb-1.5" />
						<div className="h-6 w-10 bg-white/5 rounded" />
					</div>
				))}
			</div>

			{/* Tabs */}
			<div className="flex items-center gap-1">
				{Array.from({ length: 5 }).map((_, i) => (
					<div key={i} className="h-6 w-16 bg-white/5 rounded-lg" />
				))}
			</div>

			{/* Event list */}
			<div className="rounded-xl border border-tw-border bg-tw-card overflow-hidden">
				<EventListSkeleton />
			</div>
		</div>
	)
}

// ─── Page ──────────────────────────────────────────────────────

function EventsPage() {
	const { repo, repos, isLoading } = useWorkspace();
	const repoId = repo?.id;
	const trpc = useTRPC();
	const githubAppSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-app";

	const [filters, setFilters] = useState<FilterState>({
		action: null,
		username: "",
	})

	const [page, setPage] = useState(0);
	const limit = 50;

	const queryInput = useMemo(
		() => ({
			repoId: repoId!,
			limit,
			offset: page * limit,
			actions: filters.action ? [filters.action] as any[] : undefined,
			targetUsername: filters.username || undefined,
		}),
		[repoId, page, filters],
	)

	const eventsQuery = useQuery({
		...trpc.events.list.queryOptions(queryInput),
		enabled: !!repoId,
		staleTime: 15_000,
		refetchInterval: 30_000,
		placeholderData: keepPreviousData,
	})

	// Stats query is independent of tab/filter state — never re-fetches on tab switch
	const severityQuery = useQuery({
		...trpc.events.severityCounts.queryOptions(
			{ repoId: repoId!, days: 30 },
		),
		enabled: !!repoId,
		staleTime: 60_000,
	})

	// Tab counts query
	const countsQuery = useQuery({
		...trpc.events.countsByAction.queryOptions(
			{ repoId: repoId!, days: 30 },
		),
		enabled: !!repoId,
		staleTime: 60_000,
	})

	const events = (eventsQuery.data?.events ?? []) as unknown as Event[];
	const total = eventsQuery.data?.total ?? 0;
	const severityCounts = severityQuery.data ?? {};
	const actionCounts = countsQuery.data;
	const isInitialLoad = isLoading || (!eventsQuery.data && eventsQuery.isLoading);
	const isFilterFetching = eventsQuery.isFetching && !isInitialLoad;

	const hasFilters = filters.action || filters.username;

	// Show empty state if no repos
	if (!isLoading && repos.length === 0) {
		return (
			<EmptyState
				title="Install the Tripwire GitHub App"
				description="Connect your GitHub repositories to start tracking activity."
				action={{
					label: "Install GitHub App",
					href: `https://github.com/apps/${githubAppSlug}/installations/new`,
				}}
			/>
		)
	}

	// Full skeleton only on very first load (no data at all yet)
	if (isInitialLoad) {
		return <EventsPageSkeleton />;
	}

	return (
		<div className="flex flex-col py-6 md:py-8 px-4 md:px-[50px] gap-6 max-w-[1000px] mx-auto w-full">
			{/* Header */}
			<div className="flex items-start justify-between w-full">
				<div className="flex flex-col gap-0.5">
					<h1 className="tracking-[-0.02em] text-white font-medium text-xl md:text-2xl leading-[30px] m-0">
						Events
					</h1>
					<p className="text-[#FFFFFF73] text-sm leading-[18px] m-0">
						Real-time activity feed
					</p>
				</div>
			</div>

			{/* Summary counters */}
			<div className="flex flex-wrap rounded-xl overflow-clip bg-tw-card border border-[#0000000F] shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
				{[
					{ key: "success", label: "Allowed", dot: "bg-tw-success" },
					{ key: "error", label: "Blocked", dot: "bg-tw-error" },
					{ key: "warning", label: "Near Misses", dot: "bg-tw-warning" },
					{ key: "info", label: "Other", dot: "bg-tw-accent" },
				].map((item, i, arr) => (
					<div
						key={item.key}
						className={`flex flex-col grow min-w-0 pt-2.5 pb-2 px-3 md:px-4 ${i < arr.length - 1 ? "md:border-r md:border-r-[#0000000F]" : ""}`}
					>
						<div className="flex items-center gap-1.5 mb-1">
							<span className={`size-1.5 rounded-full ${item.dot}`} />
							<span className="tracking-[-0.2px] text-[#FFFFFF73] font-[520] text-[13px] leading-4">
								{item.label}
							</span>
						</div>
						<span className="text-xl leading-7 text-[#FFFFFFCC] font-semibold tabular-nums">
							{(severityCounts[item.key] ?? 0).toLocaleString()}
						</span>
					</div>
				))}
			</div>

			{/* Filters */}
			<div className="flex items-center gap-1 flex-wrap">
				<FilterTab
					label="All"
					active={!filters.action}
					count={actionCounts?.total}
					onClick={() => setFilters((f) => ({ ...f, action: null }))}
				/>
				<FilterTab
					label="Blocked"
					active={filters.action === "pipeline_blocked"}
					count={actionCounts?.pipeline_blocked}
					onClick={() =>
						setFilters((f) => ({
							...f,
							action: f.action === "pipeline_blocked" ? null : "pipeline_blocked",
						}))
					}
				/>
				<FilterTab
					label="Allowed"
					active={filters.action === "pipeline_allowed"}
					count={actionCounts?.pipeline_allowed}
					onClick={() =>
						setFilters((f) => ({
							...f,
							action: f.action === "pipeline_allowed" ? null : "pipeline_allowed",
						}))
					}
				/>
				<FilterTab
					label="Near Misses"
					active={filters.action === "rule_near_miss"}
					count={actionCounts?.rule_near_miss}
					onClick={() =>
						setFilters((f) => ({
							...f,
							action: f.action === "rule_near_miss" ? null : "rule_near_miss",
						}))
					}
				/>
				<FilterTab
					label="Config"
					active={filters.action === "rule_config_updated"}
					count={actionCounts?.rule_config_updated}
					onClick={() =>
						setFilters((f) => ({
							...f,
							action: f.action === "rule_config_updated" ? null : "rule_config_updated",
						}))
					}
				/>

				{/* Spacer */}
				<div className="flex-1" />

				{/* Username filter */}
				<input
					type="text"
					placeholder="Filter by user..."
					value={filters.username}
					onChange={(e) => {
						setFilters((f) => ({ ...f, username: e.target.value }));
						setPage(0)
					}}
					className="h-7 w-44 rounded-lg border border-tw-border bg-transparent px-2.5 text-[13px] text-white placeholder:text-[#FFFFFF59] outline-none focus:border-tw-accent/50 transition-colors"
				/>

				{hasFilters && (
					<button
						type="button"
						onClick={() => {
							setFilters({ action: null, username: "" });
							setPage(0)
						}}
						className="text-[13px] text-[#FFFFFF59] hover:text-white bg-transparent border-none cursor-pointer transition-colors px-2 py-1"
					>
						Clear
					</button>
				)}
			</div>

			{/* Event list */}
			<div className={`rounded-xl border border-tw-border bg-tw-card overflow-hidden transition-opacity ${isFilterFetching ? "opacity-60" : ""}`}>
				{events.length === 0 ? (
					<div className="py-16 text-center">
						<p className="text-[#FFFFFF59] text-sm m-0">
							{hasFilters
								? "No events match your filters"
								: "No events yet — activity will appear as webhooks come in"}
						</p>
					</div>
				) : (
					<div className="divide-y divide-white/[0.03]">
						{events.map((event) => (
							<EventRow key={event.id} event={event} />
						))}
					</div>
				)}
			</div>

			{/* Pagination */}
			{total > limit && (
				<div className="flex items-center justify-between">
					<span className="text-[13px] text-[#FFFFFF59] tabular-nums">
						{page * limit + 1}–{Math.min((page + 1) * limit, total)} of{" "}
						{total.toLocaleString()}
					</span>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0}
							className="px-3 py-1 rounded-lg text-[13px] font-medium text-[#FFFFFF73] bg-transparent border border-tw-border cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-white/[0.03] transition-colors"
						>
							Prev
						</button>
						<button
							type="button"
							onClick={() => setPage((p) => p + 1)}
							disabled={(page + 1) * limit >= total}
							className="px-3 py-1 rounded-lg text-[13px] font-medium text-[#FFFFFF73] bg-transparent border border-tw-border cursor-pointer disabled:opacity-30 disabled:cursor-default hover:bg-white/[0.03] transition-colors"
						>
							Next
						</button>
					</div>
				</div>
			)}
		</div>
	)
}
