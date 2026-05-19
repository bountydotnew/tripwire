import {
  createFileRoute,
  Outlet,
  Link,
  useRouterState,
  redirect,
} from "@tanstack/react-router"

export const Route = createFileRoute("/_app/settings")({
  beforeLoad: ({ location }) => {
    if (location.pathname === "/settings") {
      throw redirect({ to: "/settings/general" })
    }
  },
  component: SettingsLayout,
})

const sidebarItems = [
  { label: "General", path: "/settings/general" },
  { label: "Account", path: "/settings/account" },
  { label: "Billing", path: "/settings/billing" },
  { label: "Developers", path: "/settings/developers" },
  { label: "Organization", path: "/settings/organization", disabled: true },
]

function SettingsLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-12 px-4 py-10 md:px-[50px]">
      {/* Sidebar */}
      <div className="flex w-[160px] shrink-0 flex-col gap-1">
        <h1 className="mb-3 px-2 text-[16px] font-semibold text-tw-text-primary">
          Settings
        </h1>
        {sidebarItems.map((item) => {
          const isActive = currentPath.startsWith(item.path)
          if (item.disabled) {
            return (
              <div
                key={item.path}
                className="flex h-8 cursor-not-allowed items-center rounded-lg px-2 text-[13px] font-medium text-tw-text-muted/40"
              >
                {item.label}
              </div>
            )
          }
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex h-8 items-center justify-between rounded-lg px-2 text-[13px] font-medium transition-colors ${
                isActive
                  ? "bg-tw-card text-tw-text-primary"
                  : "text-tw-text-secondary hover:bg-tw-hover hover:text-tw-text-primary"
              }`}
            >
              {item.label}
              {isActive && (
                <span className="size-1 rounded-full bg-tw-text-tertiary" />
              )}
            </Link>
          )
        })}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
