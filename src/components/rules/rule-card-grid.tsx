import type { ReactNode } from "react";

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

// ─── Rule Visualizations ─────────────────────────────────────

export function AiSlopViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<g fill="none">
				<rect x="10" y="8" width="40" height="4" rx="2" fill="#FFFFFF12" />
			</g>
			<g fill="none">
				<rect x="10" y="17" width="34" height="4" rx="2" fill="#FFFFFF12" />
			</g>
			<g fill="none">
				<rect x="10" y="26" width="46" height="4" rx="2" fill="#34A6FF1F" />
				<rect x="5" y="26" width="2" height="4" rx="1" fill="#34A6FF" opacity="0.5" />
			</g>
			<g fill="none">
				<rect x="10" y="35" width="30" height="4" rx="2" fill="#FFFFFF12" />
			</g>
			<g fill="none">
				<rect x="10" y="44" width="38" height="4" rx="2" fill="#34A6FF1F" />
				<rect x="5" y="44" width="2" height="4" rx="1" fill="#34A6FF" opacity="0.5" />
			</g>
			<line x1="62" y1="4" x2="62" y2="52" stroke="#34A6FF1F" strokeDasharray="2 3" />
			<circle cx="62" cy="28" r="2" fill="#34A6FF" opacity="0.3" />
		</svg>
	);
}

export function ProfilePictureViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="8" y="8" width="16" height="16" rx="4" fill="#34A6FF26" />
			<rect x="28" y="8" width="16" height="16" rx="4" fill="#FFFFFF0D" />
			<line x1="28" y1="8" x2="44" y2="24" stroke="#FFFFFF26" strokeWidth="1.5" />
			<line x1="44" y1="8" x2="28" y2="24" stroke="#FFFFFF26" strokeWidth="1.5" />
			<rect x="48" y="8" width="16" height="16" rx="4" fill="#34A6FF26" />
			<rect x="8" y="32" width="16" height="16" rx="4" fill="#34A6FF26" />
			<rect x="28" y="32" width="16" height="16" rx="4" fill="#FFFFFF0D" />
			<line x1="28" y1="32" x2="44" y2="48" stroke="#FFFFFF26" strokeWidth="1.5" />
			<line x1="44" y1="32" x2="28" y2="48" stroke="#FFFFFF26" strokeWidth="1.5" />
			<rect x="48" y="32" width="16" height="16" rx="4" fill="#34A6FF26" />
		</svg>
	);
}

export function LanguageViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="8" y="10" width="24" height="6" rx="2" fill="#34A6FF26" />
			<rect x="36" y="10" width="28" height="6" rx="2" fill="#FFFFFF0D" />
			<rect x="8" y="22" width="32" height="6" rx="2" fill="#34A6FF26" />
			<rect x="44" y="22" width="20" height="6" rx="2" fill="#FFFFFF0D" />
			<rect x="8" y="34" width="18" height="6" rx="2" fill="#FFFFFF0D" />
			<line x1="8" y1="37" x2="26" y2="37" stroke="#FFFFFF40" strokeWidth="1" />
			<rect x="30" y="34" width="34" height="6" rx="2" fill="#34A6FF26" />
			<rect x="8" y="46" width="28" height="6" rx="2" fill="#34A6FF26" />
		</svg>
	);
}

export function MergedPrsViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="6" y="42" width="7" height="8" rx="1.5" fill="#FFFFFF0D" />
			<rect x="16" y="34" width="7" height="16" rx="1.5" fill="#FFFFFF0D" />
			<rect x="26" y="22" width="7" height="28" rx="1.5" fill="#34A6FF26" />
			<rect x="36" y="10" width="7" height="40" rx="1.5" fill="#34A6FF26" />
			<rect x="46" y="30" width="7" height="20" rx="1.5" fill="#FFFFFF0D" />
			<rect x="56" y="40" width="7" height="10" rx="1.5" fill="#FFFFFF0D" />
			<line x1="2" y1="28" x2="70" y2="28" stroke="#FFFFFF14" strokeDasharray="3 3" />
		</svg>
	);
}

export function AccountAgeViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<circle cx="36" cy="28" r="20" stroke="#FFFFFF14" strokeWidth="3" fill="none" />
			<circle cx="36" cy="28" r="20" stroke="#34A6FF" strokeWidth="3" fill="none"
				strokeDasharray="75 126" strokeLinecap="round" transform="rotate(-90 36 28)" opacity="0.5" />
			<circle cx="36" cy="28" r="3" fill="#34A6FF" opacity="0.4" />
			<line x1="36" y1="28" x2="36" y2="14" stroke="#34A6FF" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
			<line x1="36" y1="28" x2="46" y2="28" stroke="#FFFFFF40" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}

export function MaxPrsPerDayViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="6" y="12" width="4" height="32" rx="2" fill="#34A6FF26" />
			<rect x="14" y="20" width="4" height="24" rx="2" fill="#34A6FF26" />
			<rect x="22" y="28" width="4" height="16" rx="2" fill="#34A6FF26" />
			<rect x="30" y="16" width="4" height="28" rx="2" fill="#FFFFFF0D" />
			<rect x="38" y="24" width="4" height="20" rx="2" fill="#FFFFFF0D" />
			<line x1="2" y1="44" x2="46" y2="44" stroke="#FFFFFF14" />
			<text x="50" y="28" fill="#FFFFFF40" fontSize="10" fontFamily="system-ui">10</text>
			<line x1="48" y1="12" x2="48" y2="44" stroke="#34A6FF40" strokeDasharray="2 2" />
		</svg>
	);
}

export function MaxFilesChangedViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="8" y="8" width="12" height="14" rx="2" fill="#34A6FF26" />
			<rect x="24" y="8" width="12" height="14" rx="2" fill="#34A6FF26" />
			<rect x="40" y="8" width="12" height="14" rx="2" fill="#34A6FF26" />
			<rect x="56" y="8" width="12" height="14" rx="2" fill="#FFFFFF0D" />
			<rect x="8" y="26" width="12" height="14" rx="2" fill="#34A6FF26" />
			<rect x="24" y="26" width="12" height="14" rx="2" fill="#FFFFFF0D" />
			<rect x="40" y="26" width="12" height="14" rx="2" fill="#FFFFFF0D" />
			<rect x="56" y="26" width="12" height="14" rx="2" fill="#FFFFFF0D" />
			<line x1="4" y1="44" x2="68" y2="44" stroke="#FFFFFF14" />
			<text x="30" y="52" fill="#FFFFFF40" fontSize="8" fontFamily="system-ui">50 files</text>
		</svg>
	);
}

export function RepoActivityViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="8" y="10" width="10" height="10" rx="2" fill="#34A6FF26" />
			<rect x="22" y="10" width="10" height="10" rx="2" fill="#34A6FF26" />
			<rect x="36" y="10" width="10" height="10" rx="2" fill="#34A6FF26" />
			<rect x="50" y="10" width="10" height="10" rx="2" fill="#FFFFFF0D" />
			<rect x="8" y="24" width="10" height="10" rx="2" fill="#34A6FF26" />
			<rect x="22" y="24" width="10" height="10" rx="2" fill="#FFFFFF0D" />
			<rect x="36" y="24" width="10" height="10" rx="2" fill="#FFFFFF0D" />
			<rect x="8" y="38" width="10" height="10" rx="2" fill="#FFFFFF0D" />
			<circle cx="58" cy="42" r="6" stroke="#34A6FF" strokeWidth="1.5" fill="none" opacity="0.4" />
			<path d="M56 42l2 2 4-4" stroke="#34A6FF" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.6" />
		</svg>
	);
}

export function ProfileReadmeViz() {
	return (
		<svg width="110" height="86" viewBox="0 0 72 56" fill="none">
			<rect x="12" y="6" width="48" height="44" rx="4" stroke="#FFFFFF14" strokeWidth="1.5" fill="none" />
			<circle cx="24" cy="18" r="6" fill="#34A6FF26" />
			<rect x="34" y="14" width="20" height="3" rx="1.5" fill="#FFFFFF14" />
			<rect x="34" y="20" width="14" height="2" rx="1" fill="#FFFFFF0D" />
			<line x1="16" y1="30" x2="56" y2="30" stroke="#FFFFFF0D" />
			<rect x="16" y="36" width="40" height="2" rx="1" fill="#FFFFFF0D" />
			<rect x="16" y="42" width="32" height="2" rx="1" fill="#FFFFFF0D" />
			<text x="20" y="18" fill="#34A6FF" fontSize="6" fontFamily="system-ui" opacity="0.6">MD</text>
		</svg>
	);
}
