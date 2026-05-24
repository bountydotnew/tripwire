import { AreaChart, Area, XAxis, ResponsiveContainer, Tooltip } from "recharts"

interface BlacklistTrendChartProps {
  data: Array<{ month: string; created: number; merged: number }>
}

export function BlacklistTrendChart({ data }: BlacklistTrendChartProps) {
  return (
    <div className="w-full min-w-0 flex-1 overflow-clip rounded-2xl border border-[#0000000F] bg-tw-card p-1 shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px] md:w-auto">
      <div className="flex items-center px-4 py-2">
        <span className="font-['Inter',system-ui,sans-serif] text-[13px] leading-4 font-[520] tracking-[-0.2px] text-white">
          Blacklist Trend
        </span>
      </div>
      <div className="px-1.5 pb-1.5">
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="createdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#118AF3" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#118AF3" stopOpacity={0.1} />
                </linearGradient>
                <linearGradient id="mergedGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#DF750C" stopOpacity={0.8} />
                  <stop offset="95%" stopColor="#DF750C" stopOpacity={0.1} />
                </linearGradient>
              </defs>
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
              />
              <Area
                type="monotone"
                dataKey="created"
                stroke="#118AF3"
                strokeWidth={2}
                fill="url(#createdGrad)"
              />
              <Area
                type="monotone"
                dataKey="merged"
                stroke="#DF750C"
                strokeWidth={2}
                fill="url(#mergedGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-center gap-4 pt-3">
          <div className="flex items-center gap-1.5">
            <div className="size-2 shrink-0 rounded-xs bg-tw-chart-blue" />
            <span className="font-['Inter',system-ui,sans-serif] text-[11px] leading-3.5 tracking-[-0.2px] text-[#FFFFFF99]">
              PRs Created
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="size-2 shrink-0 rounded-xs bg-tw-chart-orange" />
            <span className="font-['Inter',system-ui,sans-serif] text-[11px] leading-3.5 tracking-[-0.2px] text-[#FFFFFF99]">
              PRs Merged
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
