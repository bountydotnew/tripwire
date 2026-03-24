import { Outlet } from "@tanstack/react-router";
import { AppHeader } from "./app-header";
import { Sidebar } from "./sidebar";
import { WorkspaceProvider } from "#/lib/workspace-context";
import { AuthProvider } from "#/lib/auth-context";
import { SidebarProvider } from "#/lib/sidebar-context";

export function AppShell() {
	return (
		<AuthProvider>
			<WorkspaceProvider>
				<SidebarProvider>
					<div className="flex flex-col h-screen overflow-hidden">
						<AppHeader />
						<div className="flex flex-1 min-h-0">
							<Sidebar />
							<main className="flex-1 overflow-auto bg-tw-bg">
								<Outlet />
							</main>
						</div>
					</div>
				</SidebarProvider>
			</WorkspaceProvider>
		</AuthProvider>
	);
}
