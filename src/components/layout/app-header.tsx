import { TripwireLogo } from "../icons/tripwire-logo";
import { SlashDivider } from "../icons/slash-divider";
import { ChevronSort } from "../icons/chevron-sort";
import { SidebarToggleIcon } from "../icons/menu-icon";
import {
	Menu,
	MenuItem,
	MenuPopup,
	MenuTrigger,
} from "@/components/ui/menu";
import { useSidebar } from "#/lib/sidebar-context";

export function AppHeader() {
	const { toggle } = useSidebar();

	return (
		<header className="flex items-center justify-between w-full h-[58px] pl-3 md:pl-5 pr-2 bg-tw-sidebar border-b border-tw-border shrink-0 py-4">
			<div className="flex items-center gap-2 md:gap-[3px]">
				{/* Mobile sidebar toggle */}
				<button
					type="button"
					onClick={toggle}
					className="p-1.5 rounded-md hover:bg-white/10 md:hidden text-tw-text-secondary"
				>
					<SidebarToggleIcon className="w-5 h-5" />
				</button>
				<TripwireLogo />
				<SlashDivider />
				<Menu>
					<MenuTrigger className="flex h-[25px] items-center gap-[3px] px-2 py-0.5 rounded-full bg-tw-card hover:bg-tw-card/80 transition-colors">
						<span className="text-[15px] leading-snug text-white font-medium">
							tripwire
						</span>
						<ChevronSort />
					</MenuTrigger>
					<MenuPopup align="start" sideOffset={4} className="border border-tw-border">
						<MenuItem disabled className="opacity-100">
							<span>tripwire</span>
							<span className="ml-auto text-xs text-tw-text-secondary">current</span>
						</MenuItem>
						<a href="https://bounty.new" target="_blank">
							<MenuItem>
								<span>bounty</span>
							</MenuItem>
						</a>
					</MenuPopup>
				</Menu>
			</div>
		</header>
	);
}
