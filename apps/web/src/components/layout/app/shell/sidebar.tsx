import { Link, useRouterState } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "@tripwire/ui/icons/chevron-down"
import { CloseIcon } from "@tripwire/ui/icons/close-icon"
import { HomeIcon } from "@tripwire/ui/icons/home-icon"
import { RulesIcon } from "@tripwire/ui/icons/rules-icon"
import { InsightsIcon } from "@tripwire/ui/icons/insights-icon"
import { AutomationsIcon } from "@tripwire/ui/icons/automations-icon"
import { EventsIcon } from "@tripwire/ui/icons/events-icon"
import { IntegrationsIcon } from "@tripwire/ui/icons/integrations-icon"
import { useWorkspace } from "#/providers/workspace-context"
import { useSidebar } from "#/providers/sidebar-context"
import { Button } from "@tripwire/ui/button"

/**
 * Nav items render org-scoped routes keyed by the active org's slug.
 * Listed explicitly per page so TanStack Router's typed `to` template
 * can resolve them at compile time.
 */
type NavRoute =
  | "/$orgHandle/home"
  | "/$orgHandle/rules"
  | "/$orgHandle/insights"
  | "/$orgHandle/automations"
  | "/$orgHandle/events"
  | "/$orgHandle/integrations"

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  to: NavRoute
  pageSegment: string
}

const topNav: NavItem[] = [
  {
    label: "Home",
    icon: HomeIcon,
    to: "/$orgHandle/home",
    pageSegment: "home",
  },
]

const workspaceNav: NavItem[] = [
  {
    label: "Rules",
    icon: RulesIcon,
    to: "/$orgHandle/rules",
    pageSegment: "rules",
  },
  {
    label: "Insights",
    icon: InsightsIcon,
    to: "/$orgHandle/insights",
    pageSegment: "insights",
  },
  {
    label: "Automations",
    icon: AutomationsIcon,
    to: "/$orgHandle/automations",
    pageSegment: "automations",
  },
  {
    label: "Events",
    icon: EventsIcon,
    to: "/$orgHandle/events",
    pageSegment: "events",
  },
  {
    label: "Integrations",
    icon: IntegrationsIcon,
    to: "/$orgHandle/integrations",
    pageSegment: "integrations",
  },
]

export function Sidebar() {
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const { org, orgs, setOrg } = useWorkspace()
  const { isOpen, close } = useSidebar()
  const [switcherOpen, setSwitcherOpen] = useState(false)
  const switcherRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        switcherRef.current &&
        !switcherRef.current.contains(e.target as Node)
      ) {
        setSwitcherOpen(false)
      }
    }
    if (switcherOpen) {
      document.addEventListener("mousedown", handleClickOutside)
      return () => document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [switcherOpen])

  const orgName = org?.name ?? "Workspace"
  const orgInitial = orgName.charAt(0).toUpperCase()
  const orgSlug = org?.slug

  const renderNavItem = (item: NavItem) => {
    const Icon = item.icon
    const isActive =
      orgSlug !== undefined && currentPath === `/${orgSlug}/${item.pageSegment}`
    return (
      <Link
        key={item.pageSegment}
        to={item.to}
        params={{ orgHandle: orgSlug ?? "_" }}
        onClick={close}
        className={`mx-0.5 flex h-[34px] items-center gap-2 rounded-lg px-2 no-underline ${
          isActive ? "bg-tw-card" : ""
        }`}
      >
        <Icon className="text-[#939393]" />
        <span className="truncate text-base font-medium text-[#CDCDCD]">
          {item.label}
        </span>
      </Link>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-tw-bg/50 md:hidden"
          onClick={close}
        />
      )}
      <aside
        className={`bg-tw-sidebar fixed top-0 left-0 z-50 flex h-screen w-[233px] shrink-0 flex-col gap-2 overflow-y-auto border-r border-tw-border px-2 pt-4 pb-2 transition-transform duration-200 ease-in-out md:relative md:z-auto md:h-full ${isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} `}
      >
        {/* Mobile close button */}
        <Button
          onClick={close}
          variant="ghost"
          size="icon-sm"
          className="absolute top-4 right-2 text-tw-text-secondary md:hidden"
        >
          <CloseIcon />
        </Button>

        {/* Workspace switcher */}
        <div className="relative" ref={switcherRef}>
          <Button
            variant="ghost"
            type="button"
            onClick={() => orgs.length > 1 && setSwitcherOpen(!switcherOpen)}
            className="flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-[#333333] bg-tw-card pr-2 pl-[5px]"
          >
            <div className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-tw-accent">
              <span className="text-center text-xs leading-none font-medium text-white">
                {orgInitial}
              </span>
            </div>
            <span className="min-w-0 flex-1 truncate text-left text-sm font-medium text-[#E6E6E6]">
              {orgName}
            </span>
            {orgs.length > 1 && (
              <ChevronDown className="size-3 shrink-0 text-tw-text-muted" />
            )}
          </Button>

          {switcherOpen && orgs.length > 1 && (
            <div className="absolute top-full left-0 z-50 mt-1 w-full overflow-hidden rounded-lg border border-tw-border bg-tw-card shadow-lg">
              {orgs.map((o) => (
                <Button
                  variant="ghost"
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOrg(o)
                    setSwitcherOpen(false)
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-tw-text-primary hover:bg-tw-hover"
                >
                  <span>{o.name}</span>
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Top nav */}
        <nav className="mt-1 flex flex-col gap-1">
          {topNav.map(renderNavItem)}
        </nav>

        {/* Workspace section */}
        <div className="mt-3.5 flex w-full shrink-0 flex-col pb-2">
          <div className="px-4 pb-1.5">
            <span className="text-[15px] leading-snug text-tw-text-muted">
              Workspace
            </span>
          </div>
          <nav className="flex flex-col gap-2 px-2">
            {workspaceNav.map(renderNavItem)}
          </nav>
        </div>
      </aside>
    </>
  )
}
