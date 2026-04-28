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
			className={`flex flex-col relative rounded-xl gap-3 bg-tw-card border p-3.5 transition-colors cursor-pointer hover:bg-tw-hover-light ${
				enabled ? "border-tw-accent/40" : "border-tw-border-card"
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
				<div className="tracking-[-0.3px] text-tw-text-primary font-medium text-[15px] leading-5">
					{title}
				</div>
				<div className="mt-0.5 text-tw-text-secondary text-xs leading-4">
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

			{/* Install button */}
			<button
				type="button"
				onClick={(e) => { e.stopPropagation(); onToggle(!enabled); }}
				className={`absolute right-3 top-3 h-6 px-2.5 rounded-md text-[11px] font-medium transition-colors ${
					enabled
						? "bg-tw-accent/15 text-tw-accent hover:bg-tw-accent/25"
						: "bg-[#ffffff14] text-white hover:bg-[#ffffff22]"
				}`}
			>
				{enabled ? "Installed \u2713" : "Install"}
			</button>
		</div>
	);
}
