import { useNavigate } from "@tanstack/react-router"
import { authClient } from "@tripwire/auth/client"
import { useEffect } from "react"
import { GitHubMarkWhiteIcon20 } from "@tripwire/ui/icons/github-mark-icon"
import { TripwireEyeMark } from "@tripwire/ui/icons/tripwire-eye-mark"

export function LoginPageSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-bg">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()

  // Redirect to / if already logged in. The root resolver picks up
  // from there and routes the user into their org workspace.
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
    return <LoginPageSkeleton />
  }

  return (
    <div className="flex h-screen w-full flex-col items-center justify-center bg-bg p-2 antialiased [font-synthesis:none]">
      <div className="flex flex-1 items-center justify-center self-stretch overflow-clip rounded-lg bg-surface-1 sm:rounded-xl">
        <div className="relative flex w-[334px] max-w-full shrink-0 flex-col gap-2 overflow-clip rounded-[10px] border border-border border-solid bg-surface-2 p-1">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-25"
            style={{
              backgroundImage:
                "radial-gradient(#2d2d31 0.5px, transparent 0.5px), linear-gradient(in oklab 180deg, oklab(24.5% 0.002 -0.005) 0%, oklab(20.6% 0.002 -0.006) 100%)",
              backgroundSize: "2px 2px, 100% 100%",
            }}
          />

          <div className="relative flex items-center justify-between gap-1 px-3 py-1.5">
            <div className="flex flex-col items-start gap-2">
              <p className="font-medium text-text text-xs leading-4">Welcome back</p>
              <p className="text-text-muted text-xs leading-5">
                Sign in to continue to your repositories.
              </p>
            </div>
            <TripwireEyeMark className="shrink-0 text-text" />
          </div>

          <button
            type="button"
            onClick={handleLogin}
            className="relative flex w-full items-center justify-center gap-1.5 rounded-sm border border-border border-solid bg-surface-inset px-4 py-2.5 transition-colors hover:bg-tw-hover-light"
          >
            <GitHubMarkWhiteIcon20 className="size-4 shrink-0 text-text" />
            <span className="font-medium text-text text-xs leading-4">Continue with Github</span>
          </button>
        </div>
      </div>
    </div>
  )
}
