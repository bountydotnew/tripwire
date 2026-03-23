import { TripwireLogo } from "../icons/tripwire-logo";

interface EmptyStateProps {
	title: string;
	description: string;
	action?: {
		label: string;
		href: string;
	};
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-24 px-8 gap-6">
			<div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-tw-surface-secondary border border-tw-border">
				<TripwireLogo className="w-8 h-8 text-tw-text-secondary" />
			</div>
			<div className="flex flex-col items-center gap-2 text-center max-w-md">
				<h2 className="text-lg font-medium text-white">{title}</h2>
				<p className="text-sm text-tw-text-secondary leading-relaxed">
					{description}
				</p>
			</div>
			{action && (
				<a
					href={action.href}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-sm font-medium hover:bg-white/90 transition-colors"
				>
					{action.label}
					<svg
						className="w-4 h-4"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
						strokeWidth={2}
					>
						<path
							strokeLinecap="round"
							strokeLinejoin="round"
							d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
						/>
					</svg>
				</a>
			)}
		</div>
	);
}
