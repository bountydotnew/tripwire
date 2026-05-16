import { createFileRoute } from "@tanstack/react-router";
import { useOrgRedirect } from "#/lib/use-org-redirect";

export const Route = createFileRoute("/_app/insights")({
	component: () => {
		useOrgRedirect((slug) => `/${slug}/insights`);
		return null;
	},
});
