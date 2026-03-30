import type { ReactNode } from "react";

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
} from "../landing/visuals";

interface RuleCardGridProps {
	title: ReactNode;
	description: string;
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
	visualization: ReactNode;
}

export function RuleCardGrid({
	title,
	description,
	enabled,
	onToggle,
	visualization,
}: RuleCardGridProps) {
	const handleCardClick = (e: React.MouseEvent) => {
		// Don't toggle if clicking on interactive elements (dropdowns, buttons inside title)
		const target = e.target as HTMLElement;
		if (target.closest('[data-dropdown]') || target.closest('button:not([data-card-toggle])')) {
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

