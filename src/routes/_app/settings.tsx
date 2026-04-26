import { createFileRoute, Outlet, Link, useRouterState, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings")({
	beforeLoad: ({ location }) => {
		if (location.pathname === "/settings") {
			throw redirect({ to: "/settings/general" });
		}
	},
	component: SettingsLayout,
});

const sidebarItems = [
	{ label: "General", path: "/settings/general" },
	{ label: "Account", path: "/settings/account" },
	{ label: "Billing", path: "/settings/billing" },
	{ label: "Organization", path: "/settings/organization", disabled: true },
];

function SettingsLayout() {
	const currentPath = useRouterState({ select: (s) => s.location.pathname });

	return (
		<div className="mx-auto flex w-full max-w-[900px] gap-12 px-4 py-10 md:px-[50px]">
			{/* Sidebar */}
			<div className="w-[160px] shrink-0 flex flex-col gap-1">
				<h1 className="text-[16px] font-semibold text-tw-text-primary mb-3 px-2">
					Settings
				</h1>
				{sidebarItems.map((item) => {
					const isActive = currentPath.startsWith(item.path);
					if (item.disabled) {
						return (
							<div
								key={item.path}
								className="flex items-center h-8 px-2 rounded-lg text-[13px] font-medium text-tw-text-muted/40 cursor-not-allowed"
							>
								{item.label}
							</div>
						);
					}
					return (
						<Link
							key={item.path}
							to={item.path}
							className={`flex items-center justify-between h-8 px-2 rounded-lg text-[13px] font-medium transition-colors ${
								isActive
									? "bg-tw-card text-tw-text-primary"
									: "text-tw-text-secondary hover:text-tw-text-primary hover:bg-tw-hover"
							}`}
						>
							{item.label}
							{isActive && (
								<span className="size-1 rounded-full bg-tw-text-tertiary" />
							)}
						</Link>
					);
				})}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				<Outlet />
			</div>
		</div>
	);
}
