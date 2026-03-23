import { TrendArrow } from "../icons/trend-arrow";

interface StatCardProps {
	label: string;
	value: number;
	trend: number;
	showBorder?: boolean;
}

export function StatCard({ label, value, trend, showBorder = true }: StatCardProps) {
	return (
		<div
			className={`flex flex-col grow justify-between min-w-0 pt-2.5 pb-2 px-4 basis-0 ${
				showBorder ? "border-r border-r-[#0000000F]" : ""
			}`}
		>
			<div className="flex items-center pb-1">
				<span className="tracking-[-0.2px] text-tw-text-secondary font-[520] text-[13px] leading-4 font-['Inter',system-ui,sans-serif]">
					{label}
				</span>
			</div>
			<div className="flex items-end gap-1">
				<span className="text-xl leading-7 text-[#FFFFFFCC] font-semibold font-['Inter',system-ui,sans-serif]">
					{value}
				</span>
				<div className="flex items-center mb-0.5 gap-0.5">
					<TrendArrow />
					<span className="tracking-[-0.2px] text-tw-success font-[520] text-[13px] leading-4 font-['Inter',system-ui,sans-serif]">
						{trend}%
					</span>
				</div>
			</div>
		</div>
	);
}
