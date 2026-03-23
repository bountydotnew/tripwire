import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/events")({
	component: () => (
		<div className="flex items-center justify-center h-full">
			<div className="text-center">
				<h2 className="text-xl font-medium text-white mb-2">Events</h2>
				<p className="text-tw-text-secondary text-sm">Coming soon</p>
			</div>
		</div>
	),
});
