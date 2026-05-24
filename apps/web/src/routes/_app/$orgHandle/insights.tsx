import { createFileRoute } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { HeroStat } from "#/components/layout/app/home/insights/hero-stat"
import { StatCard } from "#/components/layout/app/home/insights/stat-card"
import { SpamTrendChart } from "#/components/layout/app/home/insights/spam-trend-chart"
import { BlacklistTrendChart } from "#/components/layout/app/home/insights/blacklist-trend-chart"
import { EmptyState } from "#/components/shared/empty-state"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"
import {
  AreaChart,
  Area,
  XAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { routes } from "#/lib/routes"

export const Route = createFileRoute("/_app/$orgHandle/insights")({
  component: InsightsPage,
  pendingComponent: InsightsPageSkeleton,
})

function InsightsPageSkeleton() {
  return (
    <div className="flex flex-col items-center px-4 py-6 md:px-[120px] md:py-8">
      <div className="mt-3 mb-6 flex w-full flex-col gap-2 md:mt-5 md:mb-11">
        <div className="h-7 w-24 rounded bg-white/5" />
        <div className="h-5 w-64 rounded bg-white/5" />
      </div>
      <div className="flex w-full flex-col gap-3">
        <div className="h-32 w-full rounded-2xl bg-white/5" />
        <div className="h-20 w-full rounded-2xl bg-white/5" />
        <div className="h-64 w-full rounded-2xl bg-white/5" />
        <div className="flex w-full flex-col gap-3 md:flex-row">
          <div className="h-64 flex-1 rounded-2xl bg-white/5" />
          <div className="h-64 flex-1 rounded-2xl bg-white/5" />
        </div>
      </div>
    </div>
  )
}

function InsightsPage() {
  const { repo, repos, isLoading } = useWorkspace()
  const repoId = repo?.id
  const trpc = useTRPC()

  const statsQuery = useQuery(
    trpc.events.stats.queryOptions(
      { repoId: repoId! },
      { enabled: !!repoId, staleTime: 60 * 1000 }
    )
  )

  const trendsQuery = useQuery(
    trpc.events.trends.queryOptions(
      { repoId: repoId!, months: 8 },
      { enabled: !!repoId, staleTime: 60 * 1000 }
    )
  )

  const stats = statsQuery.data

  const metrics = stats
    ? [
        { label: "PRs Closed", value: stats.prsClosed, trend: 100 },
        { label: "Issues Deleted", value: stats.issuesDeleted, trend: 100 },
        { label: "Bots blacklisted", value: stats.botsBlacklisted, trend: 100 },
        { label: "Users banned", value: stats.usersBanned, trend: 0 },
      ]
    : []

  const totalBlocked = stats?.totalBlocked ?? 0

  // Transform trend data from tRPC into chart format
  const trendRows = trendsQuery.data ?? []

  // Build a full list of the last 8 months so empty months show as 0
  const allMonths: string[] = []
  const now = new Date()
  for (let i = 7; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    allMonths.push(
      d.toLocaleDateString("en-US", { month: "short", year: "2-digit" })
    )
  }

  // Group event data by month
  const monthMap = new Map<
    string,
    { spam: number; prCreated: number; prMerged: number }
  >()
  for (const month of allMonths) {
    monthMap.set(month, { spam: 0, prCreated: 0, prMerged: 0 })
  }
  for (const row of trendRows) {
    const existing = monthMap.get(row.month) ?? {
      spam: 0,
      prCreated: 0,
      prMerged: 0,
    }
    if (
      row.action === "pr_closed" ||
      row.action === "issue_deleted" ||
      row.action === "comment_deleted"
    ) {
      existing.spam += row.count
    }
    if (row.action === "pr_closed") {
      existing.prCreated += row.count
    }
    if (row.action === "bot_blacklisted") {
      existing.prMerged += row.count
    }
    monthMap.set(row.month, existing)
  }

  const spamTrendData = allMonths.map((month) => ({
    month,
    spam: monthMap.get(month)?.spam ?? 0,
  }))

  const blacklistTrendData = allMonths.map((month) => ({
    month,
    created: monthMap.get(month)?.prCreated ?? 0,
    merged: monthMap.get(month)?.prMerged ?? 0,
  }))

  // Cumulative bot count
  let cumBots = 0
  const totalBotsData = Array.from(monthMap.entries()).map(([month, d]) => {
    cumBots += d.prMerged
    return { month, bots: cumBots }
  })

  // Show empty state if no repos are connected
  if (!isLoading && repos.length === 0) {
    return (
      <EmptyState
        title="Install the Tripwire GitHub App"
        description="Connect your GitHub repositories to start tracking spam activity and protection metrics."
        action={{
          label: "Install GitHub App",
          href: routes.api.githubInstall,
        }}
      />
    )
  }

  // Show skeleton while loading
  const isDataLoading =
    isLoading || statsQuery.isLoading || trendsQuery.isLoading
  if (isDataLoading) {
    return <InsightsPageSkeleton />
  }

  return (
    <div className="flex flex-col items-center px-4 py-6 md:px-[120px] md:py-8">
      {/* Header */}
      <div className="mt-3 mb-6 flex w-full flex-col gap-2 md:mt-5 md:mb-11">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          Insights
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          Track the effectiveness of Tripwire within your repo
        </p>
      </div>

      {/* Content */}
      <div className="flex w-full flex-col gap-3">
        {/* Hero stat */}
        <HeroStat value={totalBlocked} />

        {/* Key metrics */}
        <div className="grid grid-cols-2 overflow-clip rounded-2xl border border-[#0000000F] bg-tw-card shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px] md:flex md:flex-wrap">
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
        <div className="flex w-full flex-col overflow-clip rounded-2xl border border-[#0000000F] bg-tw-card p-1 shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px]">
          <div className="flex items-center px-4 py-2">
            <span className="font-['Inter',system-ui,sans-serif] text-[13px] leading-4 font-[520] tracking-[-0.2px] text-white">
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
                  tick={{
                    fill: "#FFFFFF66",
                    fontSize: 11,
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
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
        <div className="flex w-full flex-col items-start gap-3 md:flex-row">
          <SpamTrendChart data={spamTrendData} />
          <BlacklistTrendChart data={blacklistTrendData} />
        </div>
      </div>
    </div>
  )
}
