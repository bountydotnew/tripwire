import { authClient } from "@tripwire/auth/client"
import { useEffect, useState } from "react"
import { Button } from "@tripwire/ui/button"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { Spinner } from "@tripwire/ui/spinner"

export function LoginPageSkeleton() {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#191919]">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
    </div>
  )
}

export function LoginPage() {
  const { data: session, isPending } = authClient.useSession()
  const [devLoginPending, setDevLoginPending] = useState(false)
  const [devLoginError, setDevLoginError] = useState<string | null>(null)

  // Redirect signed-in users into the app shell. The legacy /home route
  // resolves the active workspace and lands on the org-scoped home page.
  useEffect(() => {
    if (!isPending && session) {
      window.location.assign("/home")
    }
  }, [session, isPending])

  async function handleGithubLogin() {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/rules",
    })
  }

  async function handleDevLogin() {
    setDevLoginPending(true)
    setDevLoginError(null)

    try {
      const seedResponse = await fetch("/api/dev/login", {
        method: "POST",
      })

      if (!seedResponse.ok) {
        const responseBody = (await seedResponse.json().catch(() => null)) as {
          error?: string
          message?: string
        } | null

        throw new Error(
          responseBody?.error ??
            responseBody?.message ??
            "Dev login is only available while running locally."
        )
      }

      window.location.assign("/home")
    } catch (error) {
      setDevLoginError(
        error instanceof Error ? error.message : "Dev login failed."
      )
      setDevLoginPending(false)
    }
  }

  if (isPending) {
    return <LoginPageSkeleton />
  }

  return (
    <div className="flex h-screen w-full shrink-0 flex-col items-center justify-center gap-10 bg-[#191919] px-0 antialiased [font-synthesis:none]">
      <TripwireLogo className="h-10 w-10 text-white" />
      <Button
        onClick={import.meta.env.DEV ? handleDevLogin : handleGithubLogin}
        variant="outline"
        size="sm"
        disabled={devLoginPending}
        aria-label={devLoginPending ? "Logging in as dev" : undefined}
        className="min-w-24 border-[#CDCDCD] bg-white text-black hover:bg-white/90"
      >
        {devLoginPending ? (
          <Spinner className="size-4 text-black" />
        ) : import.meta.env.DEV ? (
          "Login as dev"
        ) : (
          "Log in"
        )}
      </Button>
      {devLoginError && (
        <p className="max-w-72 text-center text-sm text-tw-error">
          {devLoginError}
        </p>
      )}
    </div>
  )
}
