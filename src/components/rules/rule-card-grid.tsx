import type { ReactNode } from "react";
import type { RuleAction } from "#/db/schema";

export {
	AiSlopViz,
	ProfilePictureViz,
	LanguageViz,
	MergedPrsViz,
	AccountAgeViz,
	MaxPrsPerDayViz,
	MaxFilesChangedViz,
	RepoActivityViz,
	ProfileReadmeViz,
	CryptoViz,
} from "../landing/visuals";

const ACTION_LABELS: Record<RuleAction, string> = {
	block: "Block",
	warn: "Warn",
	log: "Log only",
	threshold: "Threshold",
};

const ACTION_COLORS: Record<RuleAction, string> = {
	block: "text-red-400",
	warn: "text-amber-400",
	log: "text-[#FFFFFF59]",
	threshold: "text-tw-accent",
};

interface RuleCardGridProps {
	title: ReactNode;
	description: string;
	enabled: boolean;
	action?: RuleAction;
	onToggle: (enabled: boolean) => void;
	onActionChange?: (action: RuleAction) => void;
	visualization: ReactNode;
}

export function RuleCardGrid({
	title,
	description,
	enabled,
	action = "block",
	onToggle,
	onActionChange,
	visualization,
}: RuleCardGridProps) {
	const handleCardClick = (e: React.MouseEvent) => {
		// Don't toggle if clicking on interactive elements (dropdowns, buttons inside title)
		const target = e.target as HTMLElement;
		if (target.closest('[data-dropdown]') || target.closest('[data-action-select]') || target.closest('button:not([data-card-toggle])')) {
			return;
		}
		onToggle(!enabled);
	};

	return (
		<div
			onClick={handleCardClick}
			className={`flex flex-col relative rounded-xl gap-3 bg-[#262525] border p-3.5 transition-colors cursor-pointer hover:bg-[#2a2a2a] ${
				enabled ? "border-tw-accent/50" : "border-[#0000004d]"
			}`}
		>
			{/* Visualization */}
			<div className={`flex justify-center pt-2.5 pb-1 transition-all pointer-events-none ${
				enabled ? "opacity-60" : "opacity-30 grayscale"
			}`}>
				{visualization}
			</div>

			{/* Content */}
			<div>
				<div className="tracking-[-0.3px] text-white font-medium text-[15px] leading-5">
					{title}
				</div>
				<div className="mt-0.5 text-[#FFFFFF73] text-xs leading-4">
					{description}
				</div>
			</div>

			{/* Action selector — only visible when enabled */}
			{enabled && onActionChange && (
				<div
					data-action-select
					className="flex items-center gap-1.5"
				>
					{(Object.keys(ACTION_LABELS) as RuleAction[]).map((a) => (
						<button
							key={a}
							type="button"
							onClick={(e) => {
								e.stopPropagation();
								onActionChange(a);
							}}
							className={`
								px-2 py-0.5 rounded-md text-[11px] font-medium border-none cursor-pointer transition-colors
								${action === a
									? `bg-white/10 ${ACTION_COLORS[a]}`
									: "bg-transparent text-[#FFFFFF33] hover:text-[#FFFFFF59]"
								}
							`}
						>
							{ACTION_LABELS[a]}
						</button>
					))}
				</div>
			)}

			{/* Toggle */}
			<div
				data-card-toggle
				role="switch"
				aria-checked={enabled}
				className={`absolute right-3.5 top-3.5 w-10 h-[22px] rounded-[11px] transition-colors pointer-events-none ${
					enabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"
				}`}
			>
				<div
					className={`w-[18px] h-[18px] absolute top-0.5 rounded-[9px] transition-all ${
						enabled ? "right-0.5 bg-white" : "left-0.5 bg-[#FFFFFF59]"
					}`}
				/>
			</div>
		</div>
	);
}
