interface RuleCardProps {
	title: React.ReactNode;
	description: string;
	enabled: boolean;
	onToggle: (enabled: boolean) => void;
}

export function RuleCard({ title, description, enabled, onToggle }: RuleCardProps) {
	return (
		<div className="flex justify-between items-center w-full rounded-xl bg-tw-card border border-tw-border-card p-3">
			<div className="flex flex-col gap-0.5 min-w-0 flex-1 mr-4">
				<div className="tracking-[-0.02em] text-white font-medium text-base leading-5">
					{title}
				</div>
				<div className="text-tw-text-secondary text-xs leading-4">
					{description}
				</div>
			</div>
			<button
				type="button"
				role="switch"
				aria-checked={enabled}
				onClick={() => onToggle(!enabled)}
				className={`w-10 h-[22px] relative shrink-0 rounded-[11px] transition-colors cursor-pointer border-none ${
					enabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"
				}`}
			>
				<div
					className={`w-[18px] h-[18px] absolute top-0.5 rounded-[9px] transition-all ${
						enabled
							? "right-0.5 bg-white"
							: "left-0.5 bg-[#FFFFFF59]"
					}`}
				/>
			</button>
		</div>
	);
}
