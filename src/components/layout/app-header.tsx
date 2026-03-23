import { TripwireLogo } from "../icons/tripwire-logo";
import { SlashDivider } from "../icons/slash-divider";
import { ChevronSort } from "../icons/chevron-sort";

export function AppHeader() {
	return (
		<header className="flex items-center justify-between w-full h-[58px] pl-5 pr-2 bg-tw-sidebar border-b border-tw-border shrink-0 py-4">
			<div className="flex items-center gap-[3px]">
				<TripwireLogo />
				<SlashDivider />
				<div className="flex h-[25px] items-center gap-[3px] px-2 py-0.5 rounded-full bg-tw-card">
					<span className="text-[15px] leading-snug text-white font-medium">
						tripwire
					</span>
					<ChevronSort />
				</div>
			</div>
		</header>
	);
}
