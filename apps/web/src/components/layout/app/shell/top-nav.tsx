import { Link, useRouterState, useNavigate } from "@tanstack/react-router"
import { Button } from "@tripwire/ui/button"
import { useQuery } from "@tanstack/react-query"
import { useGitHubSignalStream } from "#/lib/github/use-signal-stream"
import { useRepoSignalTargets } from "#/lib/github/use-repo-signal-targets"
import {
  HomeNavIcon,
  RulesNavIcon,
  InsightsNavIcon,
  WorkflowsNavIcon,
  EventsNavIcon,
  IntegrationsNavIcon,
  VisibilityNavIcon,
  TripwireSparkIcon,
} from "@tripwire/ui/icons/nav-icons"
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@tripwire/ui/menu"
import { useAuth } from "@tripwire/auth/components"
import { useFeedback } from "@tripwire/feedback"
import { useWorkspace } from "#/providers/workspace-context"
import { OrgRepoSwitcher } from "./org-repo-switcher"
import { useTRPC } from "#/integrations/trpc/react"
import { useEventsUnread } from "#/hooks/use-events-unread"
import { authClient } from "@tripwire/auth/client"
import { useCustomer } from "autumn-js/react"

interface NavItem {
  key: string
  path: string
  label: string
  Icon: React.ComponentType<{ active?: boolean; showDot?: boolean }>
  badgeKey?: "events" | "rules" | "insights"
}

const navItems: NavItem[] = [
  { key: "home", path: "home", label: "Home", Icon: HomeNavIcon },
  {
    key: "rules",
    path: "rules",
    label: "Rules",
    Icon: RulesNavIcon,
    badgeKey: "rules",
  },
  {
    key: "insights",
    path: "insights",
    label: "Insights",
    Icon: InsightsNavIcon,
    badgeKey: "insights",
  },
  {
    key: "automations",
    path: "automations",
    label: "Automations",
    Icon: WorkflowsNavIcon,
  },
  {
    key: "events",
    path: "events",
    label: "Events",
    Icon: EventsNavIcon,
    badgeKey: "events",
  },
  {
    key: "visibility",
    path: "visibility",
    label: "Visibility",
    Icon: VisibilityNavIcon,
  },
  {
    key: "integrations",
    path: "integrations",
    label: "Integrations",
    Icon: IntegrationsNavIcon,
  },
]

interface TopNavProps {
  askOpen?: boolean
  onToggleAsk?: () => void
}

export function TopNav({ askOpen, onToggleAsk }: TopNavProps) {
  const { user } = useAuth()
  const { startSelection } = useFeedback()
  const { org, repo } = useWorkspace()
  const { data: customer } = useCustomer()
  const isPro = customer?.subscriptions?.some(
    (s: { planId: string; status: string }) =>
      s.planId === "pro" && s.status === "active"
  )
  const trpc = useTRPC()
  const routerState = useRouterState()
  const currentPath = routerState.location.pathname

  const meQuery = useQuery({
    ...trpc.auth.me.queryOptions(),
    staleTime: 60_000,
  })
  const isAdmin = meQuery.data?.isAdmin ?? false

  // Fetch event counts for badge
  const countsQueryOpts = trpc.events.countsByAction.queryOptions({
    repoId: repo?.id ?? "",
    days: 7,
  })
  const countsQuery = useQuery({
    ...countsQueryOpts,
    enabled: !!repo?.id,
    staleTime: 60_000,
  })

  // Fetch enabled rules count for badge
  const rulesCountQuery = useQuery({
    ...trpc.rules.countEnabled.queryOptions({
      repoId: repo?.id ?? "",
    }),
    enabled: !!repo?.id,
    staleTime: 60_000,
  })

  // Repo-wide signal stream so the nav badge updates within ~1s of a
  // webhook arriving (no need to navigate to the events page first).
  useGitHubSignalStream(
    useRepoSignalTargets(repo?.fullName, [countsQueryOpts.queryKey])
  )

  // Only show blocked + near misses in badge (actionable items)
  const eventsBadge = countsQuery.data
    ? (countsQuery.data.pipeline_blocked || 0) +
      (countsQuery.data.rule_near_miss || 0)
    : undefined

  const eventsUnread = useEventsUnread(repo?.id)

  const getBadge = (item: NavItem): number | undefined => {
    if (item.badgeKey === "events") return eventsBadge
    if (item.badgeKey === "rules") return rulesCountQuery.data?.enabled
    return undefined
  }

  // Determine which nav item is active based on current path
  const getIsActive = (item: NavItem) => {
    if (item.path === "home") {
      return currentPath === "/" || currentPath.endsWith("/home")
    }
    return (
      currentPath.endsWith(`/${item.path}`) ||
      currentPath.includes(`/${item.path}/`)
    )
  }

  // Build a workspace-aware nav path
  const getNavPath = (page: string) => {
    if (org) return `/${org.slug}/${page}`
    return `/${page}`
  }

  const navigate = useNavigate()
  const isHomePage =
    currentPath === "/home" ||
    currentPath === "/" ||
    currentPath.endsWith("/home")
  const isChatRoute = currentPath.startsWith("/chat/")
  const showAskButton = !isHomePage && !isChatRoute

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate({ to: "/login" })
  }

  return (
    <div className="flex shrink-0 items-center justify-between gap-3 px-3 py-2">
      <div className="flex items-start gap-3">
        {/* User avatar with dropdown */}
        <Menu>
          <MenuTrigger className="flex size-8 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-80">
            <div
              className="relative size-7 shrink-0 overflow-hidden rounded-full bg-tw-card bg-cover bg-center"
              style={{
                backgroundImage: user?.image
                  ? `url('${user.image}')`
                  : "url('https://i.pravatar.cc/80?img=12')",
              }}
            />
          </MenuTrigger>
          <MenuPopup>
            <div className="flex items-center gap-3 px-2 py-1.5">
              <div
                className="size-8 shrink-0 overflow-hidden rounded-full bg-tw-card bg-cover bg-center"
                style={{
                  backgroundImage: user?.image
                    ? `url('${user.image}')`
                    : undefined,
                }}
              />
              <div className="flex flex-col">
                <span className="flex items-center gap-1.5 text-[14px] leading-tight font-medium text-tw-text-primary">
                  {user?.name ?? "User"}
                  {isPro && (
                    <span className="rounded bg-tw-inner px-1.5 py-px text-[10px] font-semibold tracking-wider text-tw-text-muted uppercase">
                      Pro
                    </span>
                  )}
                </span>
                <span className="text-[12px] leading-tight text-tw-text-muted">
                  {user?.email ?? ""}
                </span>
              </div>
            </div>
            <MenuSeparator />
            <MenuItem onClick={() => navigate({ to: "/settings/account" })}>
              Profile
            </MenuItem>
            <MenuItem onClick={() => navigate({ to: "/settings/account" })}>
              Settings
            </MenuItem>
            <MenuItem
              onClick={() => {
                setTimeout(() => startSelection(), 100)
              }}
            >
              Send Feedback
            </MenuItem>
            <AdminMenuItem
              isAdmin={isAdmin}
              onNavigate={() => navigate({ to: "/admin" })}
            />
            <MenuSeparator />
            <MenuItem onClick={handleSignOut}>Sign out</MenuItem>
          </MenuPopup>
        </Menu>

        {/* Navigation items */}
        <nav className="flex items-center gap-0.5">
          {navItems.map((item) => {
            const isActive = getIsActive(item)
            return (
              <Link
                key={item.key}
                to={getNavPath(item.path)}
                className={`group flex h-8 items-center justify-center gap-1.5 rounded-lg px-3 transition-colors ${
                  isActive ? "bg-tw-card" : "hover:bg-tw-hover"
                }`}
              >
                <item.Icon
                  active={isActive}
                  showDot={
                    item.key === "events" ? eventsUnread && !isActive : false
                  }
                />
                <span
                  className={`text-[13px] leading-none font-medium ${
                    isActive
                      ? "text-[#FAFAFA]"
                      : "text-tw-text-muted group-hover:text-tw-text-primary"
                  }`}
                >
                  {item.label}
                </span>
                {getBadge(item) ? (
                  <span
                    className={`text-[13px] leading-none font-medium tabular-nums ${
                      isActive ? "text-[#FAFAFA]" : "text-tw-text-muted"
                    }`}
                  >
                    {getBadge(item)}
                  </span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </div>

      {/* Right side: Org/repo switcher + Ask button */}
      <div className="flex items-center gap-1">
        <OrgRepoSwitcher />
        {showAskButton && onToggleAsk ? (
          <Button
            variant="ghost"
            onClick={onToggleAsk}
            type="button"
            className={`flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 transition-colors ${
              askOpen
                ? "bg-tw-card text-[#FAFAFA]"
                : "text-tw-text-muted hover:bg-tw-hover hover:text-tw-text-primary"
            }`}
            aria-label="Ask Tripwire"
          >
            <TripwireSparkIcon className="text-tw-text-secondary" />
            <span className="text-[13px] leading-none font-medium">Ask</span>
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function AdminMenuItem({
  isAdmin,
  onNavigate,
}: {
  isAdmin: boolean
  onNavigate: () => void
}) {
  if (!isAdmin) return null
  return (
    <>
      <MenuSeparator />
      <MenuItem onClick={onNavigate}>Admin</MenuItem>
    </>
  )
}
