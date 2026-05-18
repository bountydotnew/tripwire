import { TripwireLogo } from "../icons/tripwire-logo";
import { Button } from "#/components/ui/button";

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
				<Button
					size="sm"
					variant="outline"
					className="bg-white text-black border-[#CDCDCD] hover:bg-white/90"
					render={<a href={action.href}>{action.label}</a>}
				/>
			)}
		</div>
	);
}
