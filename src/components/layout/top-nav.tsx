import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
	HomeNavIcon,
	RulesNavIcon,
	InsightsNavIcon,
	WorkflowsNavIcon,
	EventsNavIcon,
	IntegrationsNavIcon,
	DotsHorizontalIcon,
	TripwireSparkIcon,
} from "../icons/nav-icons";
import { useAuth } from "#/lib/auth-context";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";

interface NavItem {
	key: string;
	path: string;
	label: string;
	Icon: React.ComponentType<{ active?: boolean }>;
	badgeKey?: "events" | "rules" | "insights";
}

const navItems: NavItem[] = [
	{ key: "home", path: "/home", label: "Home", Icon: HomeNavIcon },
	{ key: "rules", path: "/rules", label: "Rules", Icon: RulesNavIcon, badgeKey: "rules" },
	{ key: "insights", path: "/insights", label: "Insights", Icon: InsightsNavIcon, badgeKey: "insights" },
	{ key: "automations", path: "/automations", label: "Workflows", Icon: WorkflowsNavIcon },
	{ key: "events", path: "/events", label: "Events", Icon: EventsNavIcon, badgeKey: "events" },
	{ key: "integrations", path: "/integrations", label: "Integrations", Icon: IntegrationsNavIcon },
];

interface TopNavProps {
	askOpen?: boolean;
	onToggleAsk?: () => void;
	onOpenTweaks?: () => void;
}

export function TopNav({ askOpen, onToggleAsk, onOpenTweaks }: TopNavProps) {
	const { user } = useAuth();
	const { repo } = useWorkspace();
	const trpc = useTRPC();
	const routerState = useRouterState();
	const currentPath = routerState.location.pathname;

	// Fetch event counts for badge
	const countsQuery = useQuery({
		...trpc.events.countsByAction.queryOptions({
			repoId: repo?.id ?? "",
			days: 7,
		}),
		enabled: !!repo?.id,
		staleTime: 60_000,
	});

	// Fetch enabled rules count for badge
	const rulesCountQuery = useQuery({
		...trpc.rules.countEnabled.queryOptions({
			repoId: repo?.id ?? "",
		}),
		enabled: !!repo?.id,
		staleTime: 60_000,
	});

	// Fetch slop blocked count for insights badge
	const slopBlockedQuery = useQuery({
		...trpc.events.slopBlocked.queryOptions({
			repoId: repo?.id ?? "",
			days: 30,
		}),
		enabled: !!repo?.id,
		staleTime: 60_000,
	});

	// Only show blocked + near misses in badge (actionable items)
	const eventsBadge = countsQuery.data
		? (countsQuery.data.pipeline_blocked || 0) + (countsQuery.data.rule_near_miss || 0)
		: undefined;

	const getBadge = (item: NavItem): number | undefined => {
		if (item.badgeKey === "events") return eventsBadge;
		if (item.badgeKey === "rules") return rulesCountQuery.data?.enabled;
		if (item.badgeKey === "insights") return slopBlockedQuery.data?.count;
		return undefined;
	};

	// Determine which nav item is active based on current path
	const getIsActive = (item: NavItem) => {
		if (item.path === "/home") {
			return currentPath === "/home" || currentPath === "/";
		}
		return currentPath.startsWith(item.path);
	};

	const isHomePage = currentPath === "/home" || currentPath === "/";
	const showAskButton = !isHomePage;

	return (
		<div className="flex items-center justify-between gap-3 py-2 px-3 shrink-0">
			<div className="flex items-start gap-3">
				{/* User avatar */}
				<div className="flex items-center justify-center rounded-full size-8">
					<div
						className="shrink-0 relative rounded-full overflow-hidden size-7 bg-cover bg-center bg-tw-card"
						style={{
							backgroundImage: user?.image
								? `url('${user.image}')`
								: "url('https://i.pravatar.cc/80?img=12')",
						}}
					/>
				</div>

				{/* Navigation items */}
				<nav className="flex items-center gap-0.5">
					{navItems.map((item) => {
						const isActive = getIsActive(item);
						return (
							<Link
								key={item.key}
								to={item.path}
								className={`group flex items-center justify-center h-8 rounded-lg px-3 gap-1.5 transition-colors ${
									isActive ? "bg-tw-card" : "hover:bg-tw-hover"
								}`}
							>
								<item.Icon active={isActive} />
								<span
									className={`text-[13px] leading-none font-medium ${
										isActive
											? "text-[#FAFAFA]"
											: "text-tw-text-muted group-hover:text-tw-text-primary"
									}`}
								>
									{item.label}
								</span>
								{getBadge(item) ? (
									<span
										className={`text-[13px] leading-none font-medium tabular-nums ${
											isActive ? "text-[#FAFAFA]" : "text-tw-text-muted"
										}`}
									>
										{getBadge(item)}
									</span>
								) : null}
							</Link>
						);
					})}
				</nav>
			</div>

			{/* Right side: Ask button + settings */}
			<div className="flex items-center gap-1">
				{showAskButton && onToggleAsk ? (
					<button
						onClick={onToggleAsk}
						type="button"
						className={`flex items-center justify-center gap-1.5 h-8 rounded-lg px-2.5 transition-colors ${
							askOpen
								? "bg-tw-card text-[#FAFAFA]"
								: "text-tw-text-muted hover:bg-tw-hover hover:text-tw-text-primary"
						}`}
						aria-label="Ask Tripwire"
					>
						<TripwireSparkIcon className="text-tw-text-secondary" />
						<span className="text-[13px] leading-none font-medium">Ask</span>
					</button>
				) : null}
				<button
					onClick={onOpenTweaks}
					type="button"
					className="flex items-center justify-center rounded-lg size-8 hover:bg-tw-hover transition-colors"
				>
					<DotsHorizontalIcon />
				</button>
			</div>
		</div>
	);
}
