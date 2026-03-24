import { Link, useMatches } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "../icons/chevron-down";
import { CloseIcon } from "../icons/close-icon";
import { HomeIcon } from "../icons/home-icon";
import { SearchIcon } from "../icons/search-icon";
import { RulesIcon } from "../icons/rules-icon";
import { InsightsIcon } from "../icons/insights-icon";
import { AutomationsIcon } from "../icons/automations-icon";
import { EventsIcon } from "../icons/events-icon";
import { IntegrationsIcon } from "../icons/integrations-icon";
import { useWorkspace } from "#/lib/workspace-context";
import { useSidebar } from "#/lib/sidebar-context";
import { Button } from "#/components/ui/button";

const topNav = [
	{ label: "Home", icon: HomeIcon, to: "/home" },
	{ label: "Search", icon: SearchIcon, to: "/search" },
] as const;

const workspaceNav = [
	{ label: "Rules", icon: RulesIcon, to: "/rules" },
	{ label: "Insights", icon: InsightsIcon, to: "/insights" },
	{ label: "Automations", icon: AutomationsIcon, to: "/automations" },
	{ label: "Events", icon: EventsIcon, to: "/events" },
	{ label: "Integrations", icon: IntegrationsIcon, to: "/integrations" },
] as const;

export function Sidebar() {
	const matches = useMatches();
	const currentPath = matches[matches.length - 1]?.fullPath ?? "";
	const { org, orgs, setOrg } = useWorkspace();
	const { isOpen, close } = useSidebar();
	const [switcherOpen, setSwitcherOpen] = useState(false);
	const switcherRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			if (
				switcherRef.current &&
				!switcherRef.current.contains(e.target as Node)
			) {
				setSwitcherOpen(false);
			}
		}
		if (switcherOpen) {
			document.addEventListener("mousedown", handleClickOutside);
			return () =>
				document.removeEventListener("mousedown", handleClickOutside);
		}
	}, [switcherOpen]);

	const orgName = org?.name ?? "Workspace";
	const orgInitial = orgName.charAt(0).toUpperCase();

	return (
		<>
			{/* Mobile overlay */}
			{isOpen && (
				<div
					className="fixed inset-0 bg-black/50 z-40 md:hidden"
					onClick={close}
				/>
			)}
			<aside
				className={`
					flex flex-col w-[233px] pt-4 pb-2 gap-2 bg-tw-sidebar border-r border-tw-border shrink-0 px-2 overflow-y-auto
					fixed md:relative top-0 left-0 h-screen md:h-full z-50 md:z-auto
					transition-transform duration-200 ease-in-out
					${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
				`}
			>
				{/* Mobile close button */}
				<Button
					onClick={close}
					variant="ghost"
					size="icon-sm"
					className="absolute top-4 right-2 md:hidden text-tw-text-secondary"
				>
					<CloseIcon />
				</Button>

				{/* Workspace switcher */}
				<div className="relative" ref={switcherRef}>
				<button
					type="button"
					onClick={() => orgs.length > 1 && setSwitcherOpen(!switcherOpen)}
					className="flex items-center h-8 min-w-0 w-full rounded-lg pr-2 pl-[5px] gap-2 bg-tw-card border border-[#333333] cursor-pointer"
				>
					<div className="flex items-center justify-center shrink-0 rounded-sm bg-tw-accent size-5">
						<span className="text-xs leading-none text-center text-white font-medium">
							{orgInitial}
						</span>
					</div>
					<span className="flex-1 min-w-0 text-sm truncate text-[#E6E6E6] font-medium text-left">
						{orgName}
					</span>
					<ChevronDown />
				</button>
				{switcherOpen && orgs.length > 1 && (
					<div className="absolute top-full left-0 right-0 mt-1 z-50 rounded-lg bg-[#2a2a2a] border border-[#353434] shadow-lg py-1">
						{orgs.map((o) => (
							<button
								key={o.id}
								type="button"
								onClick={() => {
									setOrg(o);
									setSwitcherOpen(false);
								}}
								className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm text-[#E6E6E6] hover:bg-[#353434] border-none bg-transparent cursor-pointer ${
									o.id === org?.id ? "font-medium" : ""
								}`}
							>
								<div className="flex items-center justify-center shrink-0 rounded-sm bg-tw-accent size-4">
									<span className="text-[10px] leading-none text-center text-white font-medium">
										{o.name.charAt(0).toUpperCase()}
									</span>
								</div>
								{o.name}
							</button>
						))}
					</div>
				)}
			</div>

			{/* Top nav */}
			<nav className="flex flex-col items-start gap-2 w-full">
				{topNav.map((item) => {
					const Icon = item.icon;
					return (
						<Link
							key={item.to}
							to={item.to}
							onClick={close}
							className="flex items-center h-[30px] w-full rounded-lg px-2 gap-2 mx-0.5 no-underline"
						>
							<Icon />
							<span className="text-base truncate text-[#CDCDCD] font-medium">
								{item.label}
							</span>
						</Link>
					);
				})}
			</nav>

			{/* Workspace section */}
			<div className="flex flex-col shrink-0 mt-3.5 pb-2 w-full">
				<div className="pb-1.5 px-4">
					<span className="text-[15px] leading-snug text-tw-text-muted">
						Workspace
					</span>
				</div>
				<nav className="flex flex-col px-2 gap-2">
					{workspaceNav.map((item) => {
						const Icon = item.icon;
						const isActive = currentPath === item.to;
						return (
							<Link
								key={item.to}
								to={item.to}
								onClick={close}
								className={`flex items-center h-[34px] rounded-lg px-2 gap-2 mx-0.5 no-underline ${
									isActive ? "bg-tw-card" : ""
								}`}
							>
								<Icon />
								<span className="text-base truncate text-[#CDCDCD] font-medium">
									{item.label}
								</span>
							</Link>
						);
					})}
				</nav>
			</div>
		</aside>
		</>
	);
}
