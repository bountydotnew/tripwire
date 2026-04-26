import {
	AreaChart,
	Area,
	XAxis,
	ResponsiveContainer,
	Tooltip,
} from "recharts";

interface BlacklistTrendChartProps {
	data: Array<{ month: string; created: number; merged: number }>;
}

export function BlacklistTrendChart({ data }: BlacklistTrendChartProps) {
	return (
		<div className="rounded-2xl overflow-clip bg-tw-card border border-[#0000000F] shadow-[#0000000A_0px_0px_2px,#0000000A_0px_0px_1px] p-1 flex-1 min-w-0 w-full md:w-auto">
			<div className="flex items-center py-2 px-4">
				<span className="tracking-[-0.2px] text-white font-[520] text-[13px] leading-4 font-['Inter',system-ui,sans-serif]">
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
				<div className="flex items-center justify-center pt-3 gap-4">
					<div className="flex items-center gap-1.5">
						<div className="shrink-0 rounded-xs bg-tw-chart-blue size-2" />
						<span className="tracking-[-0.2px] text-[#FFFFFF99] text-[11px] leading-3.5 font-['Inter',system-ui,sans-serif]">
							PRs Created
						</span>
					</div>
					<div className="flex items-center gap-1.5">
						<div className="shrink-0 rounded-xs bg-tw-chart-orange size-2" />
						<span className="tracking-[-0.2px] text-[#FFFFFF99] text-[11px] leading-3.5 font-['Inter',system-ui,sans-serif]">
							PRs Merged
						</span>
					</div>
				</div>
			</div>
		</div>
	);
}
