import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { useWorkspace } from "#/providers/workspace-context"

/**
 * Personal settings. Anything scoped to the *active workspace* lives
 * under `/$orgHandle/settings/*` (general, billing, members). What's
 * left here is user-level: profile, sessions, account deletion, and
 * developer API keys (which are user-owned post-migration).
 */
const PERSONAL_ITEMS = [
  { label: "Account", path: "/settings/account" as const },
  { label: "Developers", path: "/settings/developers" as const },
] satisfies ReadonlyArray<{
  label: string
  path: "/settings/account" | "/settings/developers"
}>

export function PersonalSettingsLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const { org } = useWorkspace()

  return (
    <div className="mx-auto flex w-full max-w-[900px] gap-12 px-4 py-10 md:px-[50px]">
      <div className="flex w-[160px] shrink-0 flex-col gap-1">
        <h1 className="mb-3 px-2 text-[16px] font-semibold text-tw-text-primary">
          Personal
        </h1>
        {PERSONAL_ITEMS.map((item) => {
          const isActive = currentPath.startsWith(item.path)
          return (
            <Link
              key={item.path}
              to={item.path}
              className={sidebarItemClass(isActive)}
            >
              {item.label}
              {isActive ? (
                <span className="size-1 rounded-full bg-tw-text-tertiary" />
              ) : null}
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

function OrgSettingsLink({ slug }: { slug: string }) {
  return (
    <Link
      to="/$orgHandle/settings/general"
      params={{ orgHandle: slug }}
      className="mt-3 flex h-8 items-center justify-between rounded-lg px-2 text-[13px] font-medium text-tw-text-muted transition-colors hover:bg-tw-hover hover:text-tw-text-primary"
    >
      Org settings
      <span className="text-[11px] opacity-60">→</span>
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
