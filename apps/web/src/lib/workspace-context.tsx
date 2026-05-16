import {
	createContext,
	useContext,
	useCallback,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { authClient } from "@tripwire/auth/client";
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


/** Extract orgHandle from pathname. Matches /:orgHandle/page */
function extractOrgHandle(pathname: string): string | null {
	// Skip known non-org paths
	if (
		pathname === "/" ||
		pathname.startsWith("/login") ||
		pathname.startsWith("/settings") ||
		pathname.startsWith("/chat") ||
		pathname.startsWith("/search") ||
		pathname.startsWith("/vouched") ||
		pathname.startsWith("/request") ||
		pathname.startsWith("/api") ||
		pathname.startsWith("/home") ||
		pathname.startsWith("/rules") ||
		pathname.startsWith("/events") ||
		pathname.startsWith("/insights") ||
		pathname.startsWith("/automations") ||
		pathname.startsWith("/integrations")
	) {
		return null;
	}
	// /:orgHandle or /:orgHandle/page
	const match = pathname.match(/^\/([^/]+)/);
	return match?.[1] ?? null;
}

/** Get the current page segment from a workspace URL */
function getCurrentPage(pathname: string): string {
	// After /:orgHandle/, the rest is the page
	const match = pathname.match(/^\/[^/]+\/(.+)/);
	return match?.[1] ?? "home";
}

/** Build a workspace path */
export function buildWorkspacePath(orgSlug: string, page: string): string {
	return `/${orgSlug}/${page}`;
}


export function WorkspaceProvider({ children }: { children: ReactNode }) {
	const trpc = useTRPC();
	const navigate = useNavigate();
	const routerState = useRouterState();
	const pathname = routerState.location.pathname;
	const [repo, setRepoState] = useState<Repo | null>(() => {
		if (typeof window === "undefined") return null;
		try {
			const stored = localStorage.getItem("tw:activeRepo");
			return stored ? JSON.parse(stored) : null;
		} catch {
			return null;
		}
	});

	// Extract org from URL
	const orgHandle = useMemo(() => extractOrgHandle(pathname), [pathname]);

	// Fetch all Better Auth organizations the user belongs to
	const { data: orgsData, isPending: orgsLoading } =
		authClient.useListOrganizations();

	const orgs: Org[] = useMemo(
		() =>
			(orgsData ?? []).map((o) => ({
				id: o.id,
				name: o.name,
				slug: o.slug,
				logo: o.logo,
			})),
		[orgsData],
	);

	// Resolve current org from URL handle, fall back to first org
	const currentOrg = useMemo(
		() => orgs.find((o) => o.slug === orgHandle) ?? orgs[0] ?? null,
		[orgs, orgHandle],
	);

	// Fetch repos scoped to the current BA org
	const reposQuery = useQuery(
		trpc.orgs.reposByBaOrg.queryOptions(
			{ baOrgId: currentOrg?.id ?? "" },
			{ enabled: !!currentOrg?.id, staleTime: 30_000 },
		),
	);

	const repos: Repo[] = useMemo(
		() =>
			(reposQuery.data ?? []).map((r) => ({
				id: r.id,
				name: r.name,
				fullName: r.fullName,
			})),
		[reposQuery.data],
	);

	// Auto-select repo: prefer stored repo if it exists in this org's repos, else first
	useEffect(() => {
		if (repos.length === 0) return;
		if (repo && repos.find((r) => r.id === repo.id)) return;
		const fallback = repos[0];
		setRepoState(fallback);
		try { localStorage.setItem("tw:activeRepo", JSON.stringify(fallback)); } catch {}
	}, [repos, repo]);

	// Set active BA org when org changes
	useEffect(() => {
		if (currentOrg) {
			authClient.organization.setActive({ organizationId: currentOrg.id });
		}
	}, [currentOrg?.id]);

	// setOrg navigates to the new org's current page
	const setOrg = useCallback(
		(newOrg: Org | null) => {
			if (!newOrg) return;
			const page = orgHandle ? getCurrentPage(pathname) : "home";
			navigate({ to: buildWorkspacePath(newOrg.slug, page) });
		},
		[navigate, pathname, orgHandle],
	);

	// setRepo updates state and persists to localStorage
	const setRepo = useCallback(
		(newRepo: Repo | null) => {
			setRepoState(newRepo);
			try {
				if (newRepo) {
					localStorage.setItem("tw:activeRepo", JSON.stringify(newRepo));
				} else {
					localStorage.removeItem("tw:activeRepo");
				}
			} catch { /* SSR or storage full */ }
		},
		[],
	);

	const value = useMemo<WorkspaceContextValue>(
		() => ({
			org: currentOrg,
			orgs,
			repo,
			repos,
			setOrg,
			setRepo,
			isLoading: orgsLoading || reposQuery.isPending,
		}),
		[currentOrg, orgs, repo, repos, setOrg, setRepo, orgsLoading, reposQuery.isPending],
	);

	return (
		<WorkspaceContext.Provider value={value}>
			{children}
		</WorkspaceContext.Provider>
	);
}

export function useWorkspace() {
	return useContext(WorkspaceContext);
}

/** Hook that returns the full workspace path for a given page */
export function useWorkspacePath(page: string): string {
	const { org } = useWorkspace();
	return buildWorkspacePath(org?.slug ?? "_", page);
}
