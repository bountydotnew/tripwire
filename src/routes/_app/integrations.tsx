import { createFileRoute } from "@tanstack/react-router";
import { useWorkspace } from "#/lib/workspace-context";
import { env } from "#/env";

export const Route = createFileRoute("/_app/integrations")({
	component: IntegrationsPage,
});

function IntegrationsPage() {
	const { repos, repo, setRepo, isLoading } = useWorkspace();
	const appSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-dev";

	const installUrl = `https://github.com/apps/${appSlug}/installations/new`;

	return (
		<div className="p-6 max-w-2xl mx-auto">
			<h1 className="text-xl font-semibold text-tw-text-primary mb-1">
				Integrations
			</h1>
			<p className="text-sm text-tw-text-secondary mb-6">
				Connect repositories and manage your GitHub integration.
			</p>

			{/* GitHub App Section */}
			<div className="rounded-xl bg-tw-card p-4 mb-6">
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-3">
						<div className="size-10 rounded-lg bg-[#24292f] flex items-center justify-center">
							<svg viewBox="0 0 16 16" width="20" height="20" fill="white">
								<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
							</svg>
						</div>
						<div>
							<div className="text-sm font-medium text-tw-text-primary">
								GitHub App
							</div>
							<div className="text-xs text-tw-text-muted">
								{repos.length > 0
									? `${repos.length} repo${repos.length === 1 ? "" : "s"} connected`
									: "No repos connected"}
							</div>
						</div>
					</div>
					<a
						href={installUrl}
						target="_blank"
						rel="noopener noreferrer"
						className="h-8 px-3 rounded-lg bg-tw-hover text-sm text-tw-text-primary font-medium hover:bg-[#3a3a3e] transition-colors flex items-center gap-1.5"
					>
						{repos.length > 0 ? "Manage" : "Install"}
						<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
							<path
								d="M4.5 2.5H9.5V7.5M9 3L3 9"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</a>
				</div>
			</div>

			{/* Repo Picker */}
			<div className="rounded-xl bg-tw-card p-4">
				<div className="text-sm font-medium text-tw-text-primary mb-3">
					Select Repository
				</div>

				{isLoading ? (
					<div className="text-sm text-tw-text-muted py-4 text-center">
						Loading repositories...
					</div>
				) : repos.length === 0 ? (
					<div className="text-sm text-tw-text-muted py-4 text-center">
						No repositories found.{" "}
						<a
							href={installUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-tw-text-secondary hover:text-tw-text-primary underline"
						>
							Install the GitHub app
						</a>{" "}
						to get started.
					</div>
				) : (
					<div className="space-y-1">
						{repos.map((r) => {
							const isSelected = repo?.id === r.id;
							return (
								<button
									key={r.id}
									type="button"
									onClick={() => setRepo(r)}
									className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
										isSelected
											? "bg-tw-hover text-tw-text-primary"
											: "text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text-primary"
									}`}
								>
									<div className="flex items-center justify-between">
										<span className="font-mono">{r.fullName}</span>
										{isSelected && (
											<svg
												width="14"
												height="14"
												viewBox="0 0 14 14"
												fill="none"
												className="text-tw-success"
											>
												<path
													d="M3 7L6 10L11 4"
													stroke="currentColor"
													strokeWidth="1.5"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										)}
									</div>
								</button>
							);
						})}
					</div>
				)}
			</div>

			{/* Current Selection */}
			{repo && (
				<div className="mt-4 px-3 py-2 rounded-lg bg-tw-success/10 border border-tw-success/20 text-sm text-tw-text-primary">
					<span className="text-tw-text-muted">Active repo:</span>{" "}
					<span className="font-mono">{repo.fullName}</span>
				</div>
			)}
		</div>
	);
}
