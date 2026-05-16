import { createFileRoute } from "@tanstack/react-router";
import { useOrgRedirect } from "#/lib/use-org-redirect";

export const Route = createFileRoute("/_app/home")({
	component: () => {
		useOrgRedirect((slug) => `/${slug}/home`);
		return null;
	},
});
