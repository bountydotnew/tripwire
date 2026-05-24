import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { FlaskConical, ShieldUser } from "lucide-react"
import { trpcClient } from "#/integrations/tanstack-query/root-provider"
import { TripwireLogo } from "#/components/icons/tripwire-logo"

export const Route = createFileRoute("/_admin")({
  beforeLoad: async () => {
    const me = await trpcClient.auth.me.query()
    if (!me) throw redirect({ to: "/login" })
    if (!me.isAdmin) throw redirect({ to: "/home" })
  },
  component: AdminShell,
})

function AdminShell() {
  return (
    <div className="min-h-screen bg-tw-bg text-tw-text-primary">
      <AdminTopNav />
      <main>
        <Outlet />
      </main>
    </div>
  )
}

function AdminTopNav() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 border-b border-tw-border px-3 py-2">
      <div className="flex items-center gap-3">
        <Link
          to="/admin/research"
          className="flex size-8 items-center justify-center"
        >
          <TripwireLogo className="size-6 text-tw-text-primary" />
        </Link>
        <span className="rounded bg-tw-error/15 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-tw-error uppercase">
          Admin
        </span>
        <nav className="flex items-center gap-0.5">
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
        className="flex h-8 items-center rounded-lg border border-tw-border px-3 text-[12px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-hover hover:text-tw-text-primary"
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
