import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { HeroStat } from "../../components/insights/hero-stat";
import { StatCard } from "../../components/insights/stat-card";
import { SpamTrendChart } from "../../components/insights/spam-trend-chart";
import { BlacklistTrendChart } from "../../components/insights/blacklist-trend-chart";
import { EmptyState } from "../../components/layout/empty-state";
import { useTRPC } from "#/integrations/trpc/react";
import { useWorkspace } from "#/lib/workspace-context";
import { env } from "#/env";
import {
	AreaChart,
	Area,
	XAxis,
	CartesianGrid,
	ResponsiveContainer,
	Tooltip,
} from "recharts";

export const Route = createFileRoute("/_app/insights")({
	component: InsightsPage,
	pendingComponent: InsightsPageSkeleton,
});

function InsightsPageSkeleton() {
	return (
		<div className="flex flex-col items-center py-6 md:py-8 px-4 md:px-[120px]">
			<div className="flex flex-col mb-6 md:mb-11 mt-3 md:mt-5 gap-2 w-full">
				<div className="h-7 w-24 bg-white/5 rounded" />
				<div className="h-5 w-64 bg-white/5 rounded" />
			</div>
			<div className="flex flex-col gap-3 w-full">
				<div className="h-32 w-full bg-white/5 rounded-2xl" />
				<div className="h-20 w-full bg-white/5 rounded-2xl" />
				<div className="h-64 w-full bg-white/5 rounded-2xl" />
				<div className="flex flex-col md:flex-row w-full gap-3">
					<div className="h-64 flex-1 bg-white/5 rounded-2xl" />
					<div className="h-64 flex-1 bg-white/5 rounded-2xl" />
				</div>
			</div>
		</div>
	);
}

function InsightsPage() {
	const { repo, repos, isLoading } = useWorkspace();
	const repoId = repo?.id;
	const trpc = useTRPC();
	const githubAppSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-app";

	// ─── Fetch stats from tRPC ───────────────────────────────
	const statsQuery = useQuery(
		trpc.events.stats.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 60 * 1000 },
		),
	);

	const trendsQuery = useQuery(
		trpc.events.trends.queryOptions(
			{ repoId: repoId!, months: 8 },
			{ enabled: !!repoId, staleTime: 60 * 1000 },
		),
	);

	// ─── Derive display data ─────────────────────────────────
	const stats = statsQuery.data;

	const metrics = stats
		? [
				{ label: "PRs Closed", value: stats.prsClosed, trend: 100 },
				{ label: "Issues Deleted", value: stats.issuesDeleted, trend: 100 },
				{ label: "Bots blacklisted", value: stats.botsBlacklisted, trend: 100 },
				{ label: "Users banned", value: stats.usersBanned, trend: 0 },
			]
		: [];

	const totalBlocked = stats?.totalBlocked ?? 0;

	// Transform trend data from tRPC into chart format
	const trendRows = trendsQuery.data ?? [];

	// Group by month for spam trend (all blocked actions)
	const monthMap = new Map<string, { spam: number; prCreated: number; prMerged: number }>();
	for (const row of trendRows) {
		const existing = monthMap.get(row.month) ?? { spam: 0, prCreated: 0, prMerged: 0 };
		if (row.action === "pr_closed" || row.action === "issue_deleted" || row.action === "comment_deleted") {
			existing.spam += row.count;
		}
		if (row.action === "pr_closed") {
			existing.prCreated += row.count;
		}
		if (row.action === "bot_blacklisted") {
			existing.prMerged += row.count;
		}
		monthMap.set(row.month, existing);
	}

	const spamTrendData = Array.from(monthMap.entries()).map(([month, d]) => ({
		month,
		spam: d.spam,
	}));

	const blacklistTrendData = Array.from(monthMap.entries()).map(([month, d]) => ({
		month,
		created: d.prCreated,
		merged: d.prMerged,
	}));

	// Cumulative bot count
	let cumBots = 0;
	const totalBotsData = Array.from(monthMap.entries()).map(([month, d]) => {
		cumBots += d.prMerged;
		return { month, bots: cumBots };
	});

	// Show empty state if no repos are connected
	if (!isLoading && repos.length === 0) {
		return (
			<EmptyState
				title="Install the Tripwire GitHub App"
				description="Connect your GitHub repositories to start tracking spam activity and protection metrics."
				action={{
					label: "Install GitHub App",
					href: `https://github.com/apps/${githubAppSlug}/installations/new`,
				}}
			/>
		);
	}

	// Show skeleton while loading
	const isDataLoading = isLoading || statsQuery.isLoading || trendsQuery.isLoading;
	if (isDataLoading) {
		return <InsightsPageSkeleton />;
	}

	return (
		<div className="flex flex-col items-center py-6 md:py-8 px-4 md:px-[120px]">
			{/* Header */}
			<div className="flex flex-col mb-6 md:mb-11 mt-3 md:mt-5 gap-2 w-full">
				<h1 className="text-[#FFFFFFEB] font-semibold text-2xl md:text-[28px] leading-7 m-0 font-['Inter',system-ui,sans-serif]">
					Insights
				</h1>
				<p className="text-tw-text-secondary text-sm leading-5 m-0 font-['Inter',system-ui,sans-serif]">
					Track the effectiveness of Tripwire within your repo
				</p>
			</div>

			{/* Content */}
			<div className="flex flex-col gap-3 w-full">
				{/* Hero stat */}
				<HeroStat value={totalBlocked} />

				{/* Key metrics */}
				<div className="grid grid-cols-2 md:flex md:flex-wrap rounded-2xl overflow-clip bg-tw-card border border-[#0000000F] shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
					{metrics.map((metric, i) => (
						<StatCard
							key={metric.label}
							label={metric.label}
							value={metric.value}
							trend={metric.trend}
							showBorder={i < metrics.length - 1}
						/>
					))}
				</div>

				{/* Total bots */}
				<div className="flex flex-col rounded-2xl overflow-clip w-full bg-tw-card border border-[#0000000F] shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px] p-1">
					<div className="flex items-center py-2 px-4">
						<span className="tracking-[-0.2px] text-white font-[520] text-[13px] leading-4 font-['Inter',system-ui,sans-serif]">
							Total bots
						</span>
					</div>
					<div className="h-52 w-full px-1.5 pb-1.5">
						<ResponsiveContainer width="100%" height="100%">
							<AreaChart data={totalBotsData}>
								<defs>
									<linearGradient id="botsGrad" x1="0" y1="0" x2="0" y2="1">
										<stop offset="5%" stopColor="#118AF3" stopOpacity={0.6} />
										<stop offset="95%" stopColor="#118AF3" stopOpacity={0.05} />
									</linearGradient>
								</defs>
								<CartesianGrid
									strokeDasharray="4 4"
									stroke="#FFFFFF0F"
									vertical={false}
								/>
								<XAxis
									dataKey="month"
									tick={{ fill: "#FFFFFF66", fontSize: 11, fontFamily: "Inter, system-ui, sans-serif" }}
									axisLine={false}
									tickLine={false}
								/>
								<Tooltip
									contentStyle={{
										backgroundColor: "#262525",
										border: "1px solid #333",
										borderRadius: "8px",
										fontSize: "12px",
									}}
									labelStyle={{ color: "#fff" }}
									itemStyle={{ color: "#118AF3" }}
								/>
								<Area
									type="monotone"
									dataKey="bots"
									stroke="#118AF3"
									strokeWidth={2}
									fill="url(#botsGrad)"
								/>
							</AreaChart>
						</ResponsiveContainer>
					</div>
				</div>

				{/* Trend charts row */}
				<div className="flex flex-col md:flex-row w-full items-start gap-3">
					<SpamTrendChart data={spamTrendData} />
					<BlacklistTrendChart data={blacklistTrendData} />
				</div>
			</div>
		</div>
	);
}
