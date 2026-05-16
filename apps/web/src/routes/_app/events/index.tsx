import { createFileRoute } from "@tanstack/react-router";
import { useOrgRedirect } from "#/lib/use-org-redirect";

export const Route = createFileRoute("/_app/events/")({
	component: () => {
		useOrgRedirect((slug) => `/${slug}/events`);
		return null;
	},
});
