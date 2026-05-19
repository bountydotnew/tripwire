import { Link, useMatches } from "@tanstack/react-router"
import { useState, useRef, useEffect } from "react"
import { ChevronDown } from "../icons/chevron-down"
import { CloseIcon } from "../icons/close-icon"
import { HomeIcon } from "../icons/home-icon"
import { SearchIcon } from "../icons/search-icon"
import { RulesIcon } from "../icons/rules-icon"
import { InsightsIcon } from "../icons/insights-icon"
import { AutomationsIcon } from "../icons/automations-icon"
import { EventsIcon } from "../icons/events-icon"
import { IntegrationsIcon } from "../icons/integrations-icon"
import { useWorkspace } from "#/lib/workspace-context"
import { useSidebar } from "#/lib/sidebar-context"
import { Button } from "#/components/ui/button"

const topNav = [
  { label: "Home", icon: HomeIcon, to: "/home" },
  { label: "Search", icon: SearchIcon, to: "/search" },
] as const

const workspaceNav = [
  { label: "Rules", icon: RulesIcon, to: "/rules" },
  { label: "Insights", icon: InsightsIcon, to: "/insights" },
  { label: "Automations", icon: AutomationsIcon, to: "/automations" },
  { label: "Events", icon: EventsIcon, to: "/events" },
  { label: "Integrations", icon: IntegrationsIcon, to: "/integrations" },
] as const

export function Sidebar() {
  const matches = useMatches()
  const currentPath = matches[matches.length - 1]?.fullPath ?? ""
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

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
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
            <ChevronDown />
          </Button>
          {switcherOpen && orgs.length > 1 && (
            <div className="absolute top-full right-0 left-0 z-50 mt-1 rounded-lg border border-[#353434] bg-[#2a2a2a] py-1 shadow-lg">
              {orgs.map((o) => (
                <Button
                  variant="ghost"
                  key={o.id}
                  type="button"
                  onClick={() => {
                    setOrg(o)
                    setSwitcherOpen(false)
                  }}
                  className={`flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-2 py-1.5 text-sm text-[#E6E6E6] hover:bg-[#353434] ${
                    o.id === org?.id ? "font-medium" : ""
                  }`}
                >
                  <div className="flex size-4 shrink-0 items-center justify-center rounded-sm bg-tw-accent">
                    <span className="text-center text-[10px] leading-none font-medium text-white">
                      {o.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  {o.name}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Top nav */}
        <nav className="flex w-full flex-col items-start gap-2">
          {topNav.map((item) => {
            const Icon = item.icon
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={close}
                className="mx-0.5 flex h-[30px] w-full items-center gap-2 rounded-lg px-2 no-underline"
              >
                <Icon />
                <span className="truncate text-base font-medium text-[#CDCDCD]">
                  {item.label}
                </span>
              </Link>
            )
          })}
        </nav>

        {/* Workspace section */}
        <div className="mt-3.5 flex w-full shrink-0 flex-col pb-2">
          <div className="px-4 pb-1.5">
            <span className="text-[15px] leading-snug text-tw-text-muted">
              Workspace
            </span>
          </div>
          <nav className="flex flex-col gap-2 px-2">
            {workspaceNav.map((item) => {
              const Icon = item.icon
              const isActive = currentPath === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={close}
                  className={`mx-0.5 flex h-[34px] items-center gap-2 rounded-lg px-2 no-underline ${
                    isActive ? "bg-tw-card" : ""
                  }`}
                >
                  <Icon />
                  <span className="truncate text-base font-medium text-[#CDCDCD]">
                    {item.label}
                  </span>
                </Link>
              )
            })}
          </nav>
        </div>
      </aside>
    </>
  )
}
