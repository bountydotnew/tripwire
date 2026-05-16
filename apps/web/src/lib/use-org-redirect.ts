import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useWorkspace } from "#/lib/workspace-context";

export function useOrgRedirect(buildPath: (orgSlug: string) => string) {
	const navigate = useNavigate();
	const { org, orgs, isLoading } = useWorkspace();
	useEffect(() => {
		if (isLoading) return;
		const target = org || orgs[0];
		if (target) navigate({ to: buildPath(target.slug), replace: true });
	}, [isLoading, org, orgs, navigate, buildPath]);
}
