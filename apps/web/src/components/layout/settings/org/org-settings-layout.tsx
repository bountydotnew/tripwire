import { Link, Outlet, useRouterState } from "@tanstack/react-router"
import { useWorkspace } from "#/providers/workspace-context"

const ORG_SETTINGS_NAV = [
  { label: "General", to: "/$orgHandle/settings/general" as const },
  { label: "PR Comments", to: "/$orgHandle/settings/pr-comments" as const },
  { label: "Billing", to: "/$orgHandle/settings/billing" as const },
  { label: "Members", to: "/$orgHandle/settings/members" as const },
] satisfies ReadonlyArray<{
  label: string
  to:
    | "/$orgHandle/settings/general"
    | "/$orgHandle/settings/pr-comments"
    | "/$orgHandle/settings/billing"
    | "/$orgHandle/settings/members"
}>

/**
 * Org-scoped settings layout. Personal settings (account, developers)
 * live under the non-org `/settings/*` tree — this layout only covers
 * settings that should change when the active workspace changes:
 * general, billing, members.
 */
export function OrgSettingsLayout() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const { org } = useWorkspace()
  const orgSlug = org?.slug

  return (
    <div className="mx-auto flex w-full max-w-[1280px] gap-12 px-4 py-10 md:px-[50px]">
      <div className="flex w-[160px] shrink-0 flex-col gap-1">
        <h1 className="mb-3 px-2 text-[16px] font-semibold text-tw-text-primary">
          {org?.name ?? "Workspace"}
        </h1>
        {orgSlug
          ? ORG_SETTINGS_NAV.map((item) => {
              const href = `/${orgSlug}/${item.to.replace("/$orgHandle/", "")}`
              const isActive = currentPath === href
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  params={{ orgHandle: orgSlug }}
                  className={sidebarItemClass(isActive)}
                >
                  {item.label}
                  {isActive ? (
                    <span className="size-1 rounded-full bg-tw-text-tertiary" />
                  ) : null}
                </Link>
              )
            })
          : null}
        <PersonalSettingsLink />
      </div>

      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

function PersonalSettingsLink() {
  return (
    <Link
      to="/settings/account"
      className="mt-2 flex h-8 items-center justify-between rounded-lg px-2 text-[13px] font-medium text-tw-text-muted transition-colors hover:bg-tw-hover hover:text-tw-text-primary"
    >
      Personal settings
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
