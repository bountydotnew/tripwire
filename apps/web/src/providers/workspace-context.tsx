import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate, useRouterState } from "@tanstack/react-router"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"

interface Repo {
  id: string
  name: string
  fullName: string
}

interface Org {
  id: string
  name: string
  slug: string
  logo: string | null | undefined
}

interface WorkspaceContextValue {
  org: Org | null
  orgs: Org[]
  repo: Repo | null
  repos: Repo[]
  setOrg: (org: Org | null) => void
  setRepo: (repo: Repo | null) => void
  isLoading: boolean
}

const WorkspaceContext = createContext<WorkspaceContextValue>({
  org: null,
  orgs: [],
  repo: null,
  repos: [],
  setOrg: () => {},
  setRepo: () => {},
  isLoading: true,
})

/**
 * Pathnames that are intentionally NOT org-scoped — they appear at the
 * top level of the URL tree. `extractOrgHandle` returns null for these
 * so we don't treat e.g. `/settings` as the slug "settings".
 */
const NON_ORG_PATH_PREFIXES = [
  "/login",
  "/settings",
  "/onboarding",
  "/oauth",
  "/vouched",
  "/request",
  "/users",
  "/api",
]

/** Extract orgHandle from pathname. Matches /:orgHandle/page */
function extractOrgHandle(pathname: string): string | null {
  if (pathname === "/") return null
  if (NON_ORG_PATH_PREFIXES.some((p) => pathname.startsWith(p))) return null
  const match = pathname.match(/^\/([^/]+)/)
  return match?.[1] ?? null
}

/** Get the current page segment from a workspace URL */
function getCurrentPage(pathname: string): string {
  // After /:orgHandle/, the rest is the page
  const match = pathname.match(/^\/[^/]+\/(.+)/)
  return match?.[1] ?? "home"
}

/** Build a workspace path */
export function buildWorkspacePath(orgSlug: string, page: string): string {
  return `/${orgSlug}/${page}`
}

/** localStorage key for the active repo within a specific org. */
function repoStorageKey(orgId: string): string {
  return `tw:activeRepo:${orgId}`
}

function readStoredRepo(orgId: string | null | undefined): Repo | null {
  if (!orgId) return null
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(repoStorageKey(orgId))
    return raw ? (JSON.parse(raw) as Repo) : null
  } catch {
    return null
  }
}

function writeStoredRepo(orgId: string | null | undefined, repo: Repo | null) {
  if (!orgId) return
  if (typeof window === "undefined") return
  try {
    if (repo) {
      window.localStorage.setItem(repoStorageKey(orgId), JSON.stringify(repo))
    } else {
      window.localStorage.removeItem(repoStorageKey(orgId))
    }
  } catch {
    /* storage disabled or quota */
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const routerState = useRouterState()
  const pathname = routerState.location.pathname

  // Better Auth is the single source of truth for active organization.
  // `session.activeOrganizationId` lives on the session row courtesy of
  // the `organization()` plugin. Whenever it differs from the URL or the
  // user's selection, we reconcile via `authClient.organization.setActive`.
  const { data: session } = authClient.useSession()
  const sessionActiveOrgId = session?.session?.activeOrganizationId ?? null

  const orgHandle = useMemo(() => extractOrgHandle(pathname), [pathname])

  const { data: orgsData, isPending: orgsLoading } =
    authClient.useListOrganizations()

  const orgs: Org[] = useMemo(
    () =>
      (orgsData ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        slug: o.slug,
        logo: o.logo,
      })),
    [orgsData]
  )

  // Resolution order:
  //   1. URL `$orgHandle` slug — explicit user intent (link or typed URL).
  //   2. `session.activeOrganizationId` — Better Auth's persisted choice.
  //   3. First org in the user's list — bootstrap fallback.
  const currentOrg = useMemo(() => {
    if (orgHandle) {
      const fromUrl = orgs.find((o) => o.slug === orgHandle)
      if (fromUrl) return fromUrl
    }
    if (sessionActiveOrgId) {
      const fromSession = orgs.find((o) => o.id === sessionActiveOrgId)
      if (fromSession) return fromSession
    }
    return orgs[0] ?? null
  }, [orgs, orgHandle, sessionActiveOrgId])

  // Reconcile session ← URL/first-org. `setActive` is idempotent server-side;
  // we still gate on a real mismatch to avoid an extra POST per render.
  useEffect(() => {
    if (!currentOrg) return
    if (currentOrg.id === sessionActiveOrgId) return
    authClient.organization.setActive({ organizationId: currentOrg.id })
  }, [currentOrg, sessionActiveOrgId])

  // Per-org repo selection (localStorage). Each org remembers its own
  // active repo independently so switching orgs doesn't churn the picker.
  const [repo, setRepoState] = useState<Repo | null>(() =>
    readStoredRepo(currentOrg?.id)
  )

  // Whenever the active org changes, rehydrate the repo from THAT org's slot.
  // Don't blank the state in between renders — clearing first would cause
  // every consumer to flash "no repo selected" while the new value loads.
  useEffect(() => {
    if (!currentOrg?.id) return
    const stored = readStoredRepo(currentOrg.id)
    if (stored?.id !== repo?.id) {
      setRepoState(stored)
    }
    // Intentionally depend only on org id; per-org reload should rehydrate
    // the repo slot but we don't want to thrash on every repo state change.
  }, [currentOrg?.id])

  // Fetch repos scoped to the current org so the picker has fresh options.
  const reposQuery = useQuery(
    trpc.orgs.reposByBaOrg.queryOptions(
      { baOrgId: currentOrg?.id ?? "" },
      { enabled: !!currentOrg?.id, staleTime: 30_000 }
    )
  )

  const repos: Repo[] = useMemo(
    () =>
      (reposQuery.data ?? []).map((r) => ({
        id: r.id,
        name: r.name,
        fullName: r.fullName,
      })),
    [reposQuery.data]
  )

  // Auto-select a repo when the org has any but none is selected (or the
  // stored selection no longer belongs to the active org).
  useEffect(() => {
    if (!currentOrg?.id) return
    if (repos.length === 0) return
    if (repo && repos.find((r) => r.id === repo.id)) return
    const fallback = repos[0]
    setRepoState(fallback)
    writeStoredRepo(currentOrg.id, fallback)
  }, [currentOrg?.id, repos, repo])

  const setOrg = useCallback(
    (newOrg: Org | null) => {
      if (!newOrg) return
      const page = orgHandle ? getCurrentPage(pathname) : "home"
      navigate({ to: buildWorkspacePath(newOrg.slug, page) })
      // Update session immediately so other tabs and the next render
      // already see the new value; the reconciliation effect would also
      // catch this, but doing it eagerly avoids one stale frame.
      authClient.organization.setActive({ organizationId: newOrg.id })
    },
    [navigate, pathname, orgHandle]
  )

  const setRepo = useCallback(
    (newRepo: Repo | null) => {
      setRepoState(newRepo)
      writeStoredRepo(currentOrg?.id, newRepo)
    },
    [currentOrg?.id]
  )

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
    [
      currentOrg,
      orgs,
      repo,
      repos,
      setOrg,
      setRepo,
      orgsLoading,
      reposQuery.isPending,
    ]
  )

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  return useContext(WorkspaceContext)
}

/** Hook that returns the full workspace path for a given page */
export function useWorkspacePath(page: string): string {
  const { org } = useWorkspace()
  return buildWorkspacePath(org?.slug ?? "_", page)
}
