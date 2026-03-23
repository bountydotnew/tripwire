import {
	createContext,
	useContext,
	useState,
	useEffect,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "./auth-client";
import { useAuth } from "./auth-context";
import { useTRPC } from "#/integrations/trpc/react";

interface Repo {
	id: string;
	name: string;
	fullName: string;
}

interface Org {
	id: string;
	name: string;
	slug: string;
	logo: string | null | undefined;
}

interface WorkspaceContextValue {
	org: Org | null;
	orgs: Org[];
	repo: Repo | null;
	repos: Repo[];
	setOrg: (org: Org | null) => void;
	setRepo: (repo: Repo | null) => void;
	isLoading: boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
	org: null,
	orgs: [],
	repo: null,
	repos: [],
	setOrg: () => {},
	setRepo: () => {},
	isLoading: true,
});

export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const trpc = useTRPC();
	const [org, setOrg] = useState<Org | null>(null);
	const [repo, setRepo] = useState<Repo | null>(null);

	// Fetch Better Auth organizations
	const { data: orgsData, isPending: orgsLoading } =
		authClient.useListOrganizations();

	const orgs: Org[] = (orgsData ?? []).map((o) => ({
		id: o.id,
		name: o.name,
		slug: o.slug,
		logo: o.logo,
	}));

	// Fetch Tripwire repos for the user (across all their GitHub installations)
	const reposQuery = useQuery(
		trpc.orgs.myRepos.queryOptions({ userId: user.id }),
	);

	const repos: Repo[] = (reposQuery.data ?? []).map((r) => ({
		id: r.id,
		name: r.name,
		fullName: r.fullName,
	}));

	// Auto-select first org
	useEffect(() => {
		if (!org && orgs.length > 0) {
			setOrg(orgs[0]);
			authClient.organization.setActive({
				organizationId: orgs[0].id,
			});
		}
	}, [orgs, org]);

	// Auto-select first repo when repos load
	useEffect(() => {
		if (!repo && repos.length > 0) {
			setRepo(repos[0]);
		}
	}, [repos, repo]);

	return (
		<WorkspaceContext.Provider
			value={{
				org,
				orgs,
				repo,
				repos,
				setOrg: (newOrg) => {
					setOrg(newOrg);
					setRepo(null);
					if (newOrg) {
						authClient.organization.setActive({
							organizationId: newOrg.id,
						});
					}
				},
				setRepo,
				isLoading: orgsLoading || reposQuery.isPending,
			}}
		>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	return useContext(WorkspaceContext);
}
