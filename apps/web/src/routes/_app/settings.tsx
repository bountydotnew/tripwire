import {
  createFileRoute,
  Outlet,
  Link,
  useRouterState,
  redirect,
} from "@tanstack/react-router"
import { useWorkspace } from "#/providers/workspace-context"

export const Route = createFileRoute("/_app/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/general" })
    }
  },
  component: SettingsLayout,
})

const baseItems = [
  { label: "General", path: "/settings/general" as const },
  { label: "Account", path: "/settings/account" as const },
  { label: "Billing", path: "/settings/billing" as const },
  { label: "Developers", path: "/settings/developers" as const },
]

function SettingsLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const { org } = useWorkspace()

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-12 px-4 py-10 md:px-[50px]">
      <div className="flex w-[160px] shrink-0 flex-col gap-1">
        <h1 className="mb-3 px-2 text-[16px] font-semibold text-tw-text-primary">
          Settings
        </h1>
        {baseItems.map((item) => {
          const isActive = currentPath.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={sidebarItemClass(isActive)}
            >
              {item.label}
              {isActive && (
                <span className="size-1 rounded-full bg-tw-text-tertiary" />
              )}
            </Link>
          )
        })}
        {org ? <OrgSettingsLink slug={org.slug} /> : null}
      </div>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

interface OrgSettingsLinkProps {
  slug: string
}

function OrgSettingsLink({ slug }: OrgSettingsLinkProps) {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const isActive = currentPath.startsWith(`/${slug}/settings`)
  return (
    <Link
      to="/$orgHandle/settings"
      params={{ orgHandle: slug }}
      className={sidebarItemClass(isActive)}
    >
      Organization
      {isActive ? (
        <span className="size-1 rounded-full bg-tw-text-tertiary" />
      ) : null}
    </Link>
  )
}

function sidebarItemClass(isActive: boolean): string {
  return `flex h-8 items-center justify-between rounded-lg px-2 text-[13px] font-medium transition-colors ${
    isActive
      ? "bg-tw-card text-tw-text-primary"
      : "text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text-primary"
  }`
}
