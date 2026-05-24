import { useEffect } from "react"
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router"
import { useAuth, AuthProvider } from "@tripwire/auth/components"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"

export const Route = createFileRoute("/onboarding")({
  component: OnboardingLayout,
})

function OnboardingLayout() {
  return (
    <AuthProvider>
      <OnboardingShell />
    </AuthProvider>
  )
}

function OnboardingShell() {
  const { user } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!user) navigate({ to: "/login" })
  }, [user, navigate])

  if (!user) return null

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-tw-bg px-4 py-10">
      <div className="flex w-full max-w-[440px] flex-col items-center gap-8">
        <TripwireLogo className="size-8 text-tw-text-primary" />
        <div className="w-full">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
