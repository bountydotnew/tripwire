import { Outlet, useRouterState } from "@tanstack/react-router"
import { AuthProvider } from "@tripwire/auth/components"
import { TopNav } from "#/components/layout/app/shell/top-nav"
import { WorkspaceRedirect } from "#/components/layout/app/shell/workspace-redirect"
import { InstallGitHubPrompt } from "#/components/layout/app/shell/install-github-prompt"
import { AskSidePanel } from "#/components/layout/app/chat/ask-side-panel"
import { WorkspaceProvider, useWorkspace } from "#/providers/workspace-context"
import { ChatProvider, useAIChat } from "#/providers/chat-context"
import { RepoSwitchGateProvider } from "#/providers/repo-switch-gate"
import { useRequestNotifications } from "#/hooks/use-request-notifications"
import { useOnboardingRedirect } from "#/hooks/use-onboarding-redirect"

export function AppShell() {
  return (
    <AuthProvider>
      <WorkspaceProvider>
        <RepoSwitchGateProvider>
          <ChatProvider>
            <AppShellInner />
          </ChatProvider>
        </RepoSwitchGateProvider>
      </WorkspaceProvider>
    </AuthProvider>
  )
}

function AppShellInner() {
  useRequestNotifications()
  useOnboardingRedirect()

  const { isOpen, toggle } = useAIChat()
  const { repos, isLoading: workspaceLoading, orgs } = useWorkspace()

  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const isHomePage =
    currentPath === "/home" ||
    currentPath === "/" ||
    currentPath.endsWith("/home")
  const isChatRoute = currentPath.startsWith("/chat/")
  const isAutomationEditor = /\/automations\/[^/]+$/.test(currentPath)

  const needsInstall =
    !isChatRoute && !workspaceLoading && orgs.length > 0 && repos.length === 0

  const showSidePanel =
    !isHomePage && !isChatRoute && !isAutomationEditor && isOpen

  return (
    <div className="tw-root flex h-screen flex-col overflow-hidden bg-tw-bg antialiased">
      <WorkspaceRedirect />
      <TopNav askOpen={isOpen} onToggleAsk={toggle} />
      <div
        className={`flex min-h-0 flex-1 gap-2 ${isChatRoute ? "" : "px-2 pb-2"}`}
      >
        <div
          className={`relative min-w-0 flex-1 ${isChatRoute ? "" : "tw-inset"}`}
          style={
            isChatRoute ? undefined : { boxShadow: "#00000008 0px 1px 4px" }
          }
        >
          <div className="absolute inset-0 overflow-auto">
            {needsInstall ? <InstallGitHubPrompt /> : <Outlet />}
          </div>
        </div>

        <aside
          className="tw-inset shrink-0 transition-all duration-[360ms]"
          style={{
            width: showSidePanel ? 380 : 0,
            marginRight: showSidePanel ? 0 : -8,
            opacity: showSidePanel ? 1 : 0,
            transform: showSidePanel ? "translateX(0)" : "translateX(24px)",
            transitionTimingFunction: "cubic-bezier(0.19, 1, 0.22, 1)",
          }}
        >
          {showSidePanel && <AskSidePanel />}
        </aside>
      </div>
    </div>
  )
}
