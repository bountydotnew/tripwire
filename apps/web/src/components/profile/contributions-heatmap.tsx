import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ContributionsData } from "@tripwire/github";

const COLOR_BANDS = [
	{ min: 1, max: 5, color: "#1a3a2a" },
	{ min: 6, max: 15, color: "#1f5c3a" },
	{ min: 16, max: 30, color: "#27804a" },
	{ min: 31, max: 50, color: "#34a65a" },
	{ min: 51, max: Infinity, color: "#67E19F" },
];
const EMPTY_COLOR = "#363638";
const LEGEND_COLORS = COLOR_BANDS.map((b) => b.color);

const MONTH_FMT = new Intl.DateTimeFormat(undefined, { month: "short" });
const TOOLTIP_FMT = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" });
const DAY_LABELS = [
	{ di: 1, label: "Mon" },
	{ di: 3, label: "Wed" },
	{ di: 5, label: "Fri" },
];

function colorForCount(count: number): string {
	if (count <= 0) return EMPTY_COLOR;
	for (const band of COLOR_BANDS) {
		if (count >= band.min && count <= band.max) return band.color;
	}
	return COLOR_BANDS[COLOR_BANDS.length - 1].color;
}

interface HeatmapCell {
	key: string;
	x: number;
	y: number;
	fill: string;
	count: number;
	date: string;
}

const HeatmapSvg = memo(function HeatmapSvg({
	width,
	height,
	cells,
	onMouseMove,
	onMouseLeave,
	svgRef,
}: {
	width: number;
	height: number;
	cells: HeatmapCell[];
	onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
	onMouseLeave: () => void;
	svgRef: React.RefObject<SVGSVGElement | null>;
}) {
	return (
		<svg
			ref={svgRef}
			width={width}
			height={height}
			viewBox={`0 0 ${width} ${height}`}
			className="block shrink-0"
			onMouseMove={onMouseMove}
			onMouseLeave={onMouseLeave}
		>
			{cells.map((c) => (
				<rect key={c.key} x={c.x} y={c.y} width={12} height={12} rx={3} ry={3} fill={c.fill} />
			))}
		</svg>
	);
});

interface HoveredCell {
	x: number;
	y: number;
	count: number;
	date: string;
}

export function ContributionsHeatmap({
	data,
	className,
}: {
	data: ContributionsData;
	className?: string;
}) {
	const [hovered, setHovered] = useState<HoveredCell | null>(null);
	const svgRef = useRef<SVGSVGElement>(null);

	const cell = 12;
	const gap = 3;
	const cols = data.weeks.length;
	const width = cols * (cell + gap) - gap;
	const height = 7 * (cell + gap) - gap;
	const gutterW = 24;
	const labelGap = 10;

	const monthTicks = useMemo(() => {
		const ticks: { wi: number; label: string }[] = [];
		let prev = -1;
		data.weeks.forEach((week, wi) => {
			const d = new Date(`${week.days[0].date}T12:00:00Z`);
			const m = d.getUTCMonth();
			if (prev !== m) {
				ticks.push({ wi, label: MONTH_FMT.format(d) });
				prev = m;
			}
		});
		return ticks;
	}, [data.weeks]);

	const cells = useMemo<HeatmapCell[]>(
		() =>
			data.weeks.flatMap((week, wi) =>
				week.days.map((day) => {
					const di = new Date(`${day.date}T12:00:00Z`).getUTCDay();
					return {
						key: `${wi}-${day.date}`,
						x: wi * (cell + gap),
						y: di * (cell + gap),
						fill: colorForCount(day.count),
						count: day.count,
						date: day.date,
					};
				}),
			),
		[data.weeks],
	);

	const daysByWeek = useMemo(
		() =>
			data.weeks.map((week) => {
				const arr: ({ date: string; count: number } | null)[] = Array(7).fill(null);
				for (const day of week.days) {
					arr[new Date(`${day.date}T12:00:00Z`).getUTCDay()] = day;
				}
				return arr;
			}),
		[data.weeks],
	);

	const handleMouseMove = useCallback(
		(e: React.MouseEvent<SVGSVGElement>) => {
			const svg = svgRef.current;
			if (!svg) return;
			const rect = svg.getBoundingClientRect();
			const svgX = ((e.clientX - rect.left) / rect.width) * width;
			const svgY = ((e.clientY - rect.top) / rect.height) * height;
			const wi = Math.floor(svgX / (cell + gap));
			const di = Math.floor(svgY / (cell + gap));
			const day = daysByWeek[wi]?.[di];
			if (day) {
				setHovered({ x: e.clientX, y: e.clientY, count: day.count, date: day.date });
			} else {
				setHovered((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null);
			}
		},
		[width, height, daysByWeek],
	);

	const scrollRef = useRef<HTMLDivElement>(null);

	// Auto-scroll to end (most recent)
	useEffect(() => {
		const el = scrollRef.current;
		if (el) el.scrollLeft = el.scrollWidth;
	}, [data.weeks]);

	return (
		<>
			<div className={`flex w-full min-w-0 flex-col ${className ?? ""}`}>
				<div className="relative w-full min-w-0 overflow-hidden">
					<div
						ref={scrollRef}
						className="w-full min-w-0 overflow-x-auto"
						style={{ scrollbarWidth: "none" }}
					>
						<div className="w-max">
							{/* Month labels */}
							<div className="relative mb-1 h-3.5" style={{ marginLeft: gutterW + labelGap, width }}>
								{monthTicks.map(({ wi, label }) => (
									<span
										key={`${wi}-${label}`}
										className="absolute top-0 text-[10px] leading-none text-tw-text-tertiary tabular-nums"
										style={{ left: wi * (cell + gap) }}
									>
										{label}
									</span>
								))}
							</div>
							<div className="flex items-start" style={{ gap: labelGap }}>
								{/* Day labels */}
								<div className="relative shrink-0" style={{ width: gutterW, height }}>
									{DAY_LABELS.map(({ di, label }) => (
										<span
											key={di}
											className="absolute right-0 -translate-y-1/2 text-right text-[10px] leading-none text-tw-text-tertiary tabular-nums"
											style={{ top: di * (cell + gap) + cell / 2 }}
										>
											{label}
										</span>
									))}
								</div>
								<HeatmapSvg
									svgRef={svgRef}
									width={width}
									height={height}
									cells={cells}
									onMouseMove={handleMouseMove}
									onMouseLeave={() => setHovered(null)}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<div className="flex items-center justify-between gap-2 mt-2 px-0.5">
					<div className="flex items-center gap-1.5 text-[10px] text-tw-text-tertiary">
						<span>Less</span>
						{LEGEND_COLORS.map((color, i) => (
							<span key={i} className="inline-block w-[11px] h-[11px] rounded-[3px]" style={{ backgroundColor: color }} />
						))}
						<span>More</span>
					</div>
					<span className="text-[10px] text-tw-text-tertiary">
						<span className="font-semibold text-tw-text-secondary tabular-nums">
							{data.totalContributions.toLocaleString()}
						</span>{" "}
						contributions this year
					</span>
				</div>
			</div>

			{/* Tooltip */}
			<AnimatePresence>
				{hovered && (
					<motion.div
						className="pointer-events-none fixed z-50 rounded-md border border-tw-border bg-tw-card px-2 py-1 text-[11px] text-tw-text-primary whitespace-nowrap"
						initial={{ opacity: 0, scale: 0.9 }}
						animate={{ left: hovered.x + 12, top: hovered.y + 12, opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0.9 }}
						transition={{ type: "spring", stiffness: 400, damping: 35, mass: 0.3 }}
					>
						<span className="font-semibold tabular-nums">{hovered.count}</span>{" "}
						contribution{hovered.count !== 1 ? "s" : ""} on{" "}
						{TOOLTIP_FMT.format(new Date(`${hovered.date}T12:00:00Z`))}
					</motion.div>
				)}
			</AnimatePresence>
		</>
	);
}
