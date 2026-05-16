import { createFileRoute } from "@tanstack/react-router";
import { useOrgRedirect } from "#/lib/use-org-redirect";

export const Route = createFileRoute("/_app/integrations")({
	component: () => {
		useOrgRedirect((slug) => `/${slug}/integrations`);
		return null;
	},
});
