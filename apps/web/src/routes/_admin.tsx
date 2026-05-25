import { useEffect } from "react"
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
  useRouterState,
} from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { FlaskConical, LayoutDashboard, ShieldUser } from "lucide-react"
import { AuthProvider } from "@tripwire/auth/components"
import { useTRPC } from "#/integrations/trpc/react"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { PRIVATE_ROUTE_HEADERS } from "#/lib/seo"

export const Route = createFileRoute("/_admin")({
  component: AdminShell,
  // Admin routes are gated by role on the server. No reason to expose
  // them to crawlers — noindex at the layout level.
  headers: () => PRIVATE_ROUTE_HEADERS,
})

function AdminShell() {
  return (
    <AuthProvider>
      <AdminGuard>
        <div className="tw-root flex h-screen flex-col overflow-hidden bg-tw-bg text-tw-text-primary antialiased">
          <AdminTopNav />
          <main className="flex-1 overflow-y-auto">
            <Outlet />
          </main>
        </div>
      </AdminGuard>
    </AuthProvider>
  )
}

function AdminGuard({ children }: { children: React.ReactNode }) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  // Auth check runs client-side so the user's cookies actually reach the
  // tRPC endpoint. Doing this in beforeLoad would use the module-level
  // trpcClient on SSR, which has no cookie context, and bounce the user to
  // /login even when they're signed in.
  const me = useQuery({
    ...trpc.auth.me.queryOptions(),
    staleTime: 60_000,
  })

  useEffect(() => {
    if (me.isPending) return
    if (!me.data) {
      navigate({ to: "/login" })
      return
    }
    if (!me.data.isAdmin) {
      navigate({ to: "/home" })
    }
  }, [me.isPending, me.data, navigate])

  if (me.isPending || !me.data?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-tw-bg text-[12px] text-tw-text-tertiary">
        Checking access…
      </div>
    )
  }

  return <>{children}</>
}

function AdminTopNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
      <div className="flex items-center gap-3">
        <Link
          to="/admin"
          className="flex size-8 items-center justify-center rounded-full transition-opacity hover:opacity-80"
        >
          <TripwireLogo className="size-6 text-tw-text-primary" />
        </Link>
        <span className="rounded bg-tw-error/15 px-1.5 py-px text-[10px] font-semibold tracking-wider text-tw-error uppercase">
          Admin
        </span>
        <nav className="flex items-center gap-0.5">
          <Link
            to="/admin"
            className={tabClass(currentPath === "/admin")}
          >
            <LayoutDashboard
              className={iconClass(currentPath === "/admin")}
            />
            <span className={labelClass(currentPath === "/admin")}>
              Overview
            </span>
          </Link>
          <Link
            to="/admin/research"
            className={tabClass(currentPath.startsWith("/admin/research"))}
          >
            <FlaskConical
              className={iconClass(
                currentPath.startsWith("/admin/research")
              )}
            />
            <span
              className={labelClass(
                currentPath.startsWith("/admin/research")
              )}
            >
              Research
            </span>
          </Link>
          <Link
            to="/admin/reputation"
            className={tabClass(currentPath.startsWith("/admin/reputation"))}
          >
            <ShieldUser
              className={iconClass(
                currentPath.startsWith("/admin/reputation")
              )}
            />
            <span
              className={labelClass(
                currentPath.startsWith("/admin/reputation")
              )}
            >
              Reputation
            </span>
          </Link>
        </nav>
      </div>

      <Link
        to="/home"
        className="flex h-8 items-center rounded-lg px-2.5 text-[13px] font-medium text-tw-text-muted transition-colors hover:bg-tw-hover hover:text-tw-text-primary"
      >
        Exit admin
      </Link>
    </div>
  )
}

function tabClass(isActive: boolean): string {
  return `group flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 transition-colors ${
    isActive ? "bg-tw-card" : "hover:bg-tw-hover"
  }`
}

function iconClass(isActive: boolean): string {
  return `size-3.5 ${
    isActive
      ? "text-[#FAFAFA]"
      : "text-tw-text-tertiary group-hover:text-tw-text-secondary"
  }`
}

function labelClass(isActive: boolean): string {
  return `text-[13px] leading-none font-medium ${
    isActive
      ? "text-[#FAFAFA]"
      : "text-tw-text-muted group-hover:text-tw-text-primary"
  }`
}
