import { createFileRoute } from "@tanstack/react-router";
import { useOrgRedirect } from "#/lib/use-org-redirect";

export const Route = createFileRoute("/_app/automations")({
	component: () => {
		useOrgRedirect((slug) => `/${slug}/automations`);
		return null;
	},
});
