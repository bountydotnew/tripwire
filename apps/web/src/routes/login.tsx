import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { authClient } from "@tripwire/auth/client"
import { useEffect } from "react"
import { Button } from "@tripwire/ui/button"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"

export const Route = createFileRoute("/login")({
  component: LoginPage,
})

function LoginPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  // Redirect to /rules if already logged in
  useEffect(() => {
    if (!isPending && session) {
      navigate({ to: "/" })
    }
  }, [session, isPending, navigate])

  async function handleLogin() {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/rules",
    })
  }

  if (isPending) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#191919]">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex h-screen w-full shrink-0 flex-col items-center justify-center gap-10 bg-[#191919] px-0 antialiased [font-synthesis:none]">
      <TripwireLogo className="h-10 w-10 text-white" />
      <Button
        onClick={handleLogin}
        variant="outline"
        size="sm"
        className="border-[#CDCDCD] bg-white text-black hover:bg-white/90"
      >
        Log in
      </Button>
    </div>
  )
}
