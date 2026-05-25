import { useEffect, useState } from "react"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { parseAsString, useQueryStates } from "nuqs"
import { authClient } from "@tripwire/auth/client"
import { Button } from "@tripwire/ui/button"
import { TripwireSparkIcon } from "@tripwire/ui/icons/nav-icons"
import { OauthConsentCheckRingIcon20 } from "@tripwire/ui/icons/oauth-consent-check-ring-icon"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/oauth/consent")({
  component: ConsentPage,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Authorize app"),
      description:
        "Authorize a third-party application to access your Tripwire account.",
      robots: "noindex",
    }),
})

function ConsentPage() {
  const navigate = useNavigate()
  const { data: session, isPending } = authClient.useSession()
  const [{ consent_code, client_id, scope }] = useQueryStates({
    consent_code: parseAsString,
    client_id: parseAsString,
    scope: parseAsString,
  })

  const [state, setState] = useState<
    "idle" | "submitting" | "success" | "denied" | "error"
  >("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [appName, setAppName] = useState<string | null>(null)

  useEffect(() => {
    if (!client_id) return
    let cancelled = false
    fetch(`/api/oauth/app-info?client_id=${encodeURIComponent(client_id)}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return
        if (data && typeof data.name === "string") setAppName(data.name)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [client_id])

  if (!isPending && !session) {
    navigate({
      to: "/login",
      search: { redirect: window.location.pathname + window.location.search },
    })
    return null
  }

  const scopes = (scope ?? "").split(" ").filter(Boolean)
  const clientName = appName ?? "An application"

  async function submit(accept: boolean) {
    if (!consent_code) {
      setErrorMessage("Missing consent code — this link is invalid or expired.")
      setState("error")
      return
    }
    setState("submitting")
    try {
      const res = await fetch("/api/auth/oauth2/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ accept, consent_code }),
      })
      if (!res.ok) {
        const body = await res.text()
        throw new Error(`Consent endpoint returned ${res.status}: ${body}`)
      }
      const { redirectURI } = (await res.json()) as { redirectURI: string }
      setState(accept ? "success" : "denied")
      window.setTimeout(() => {
        window.location.href = redirectURI
      }, 900)
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong."
      )
      setState("error")
    }
  }

  if (isPending) {
    return (
      <Centered>
        <Spinner />
      </Centered>
    )
  }

  if (state === "success") {
    return (
      <Centered>
        <TripwireLogo accent />
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 text-[15px] text-white">
            <OauthConsentCheckRingIcon20 /> Connected to {clientName}
          </div>
          <div className="text-[13px] text-tw-text-tertiary">
            Returning you to {clientName}…
          </div>
        </div>
      </Centered>
    )
  }

  if (state === "denied") {
    return (
      <Centered>
        <TripwireLogo />
        <div className="text-[15px] text-tw-text-secondary">
          Access denied. Returning to {clientName}…
        </div>
      </Centered>
    )
  }

  if (state === "error") {
    return (
      <Centered>
        <TripwireLogo />
        <div className="text-[15px] text-tw-text-secondary">
          {errorMessage ?? "Something went wrong."}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate({ to: "/" })}
          className="border-[#CDCDCD] bg-white text-black hover:bg-white/90"
        >
          Back to Tripwire
        </Button>
      </Centered>
    )
  }

  return (
    <Centered>
      <TripwireLogo />
      <div className="flex max-w-md flex-col items-center gap-2 text-center">
        <h1 className="text-[20px] leading-7 font-medium text-white">
          Allow {clientName} to access your Tripwire account?
        </h1>
        <p className="text-[13px] leading-5 text-tw-text-secondary">
          Signed in as{" "}
          <span className="text-white">
            {session?.user?.name ?? session?.user?.email}
          </span>
          . {clientName} will be able to use the tools below on your behalf.
        </p>
      </div>
      {scopes.length > 0 && (
        <ul className="flex min-w-[280px] flex-col gap-1 rounded-[10px] bg-tw-inner px-4 py-3 text-[13px] text-tw-text-secondary">
          {scopes.map((s) => (
            <li key={s} className="flex items-center gap-2">
              <Dot /> {humanScope(s)}
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit(false)}
          disabled={state !== "idle"}
          className="border-[#2A2A2A] bg-transparent text-tw-text-secondary hover:bg-tw-card hover:text-white"
        >
          Deny
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => submit(true)}
          disabled={state !== "idle"}
          className="border-[#CDCDCD] bg-white text-black hover:bg-white/90"
        >
          Allow
        </Button>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen w-full shrink-0 flex-col items-center justify-center gap-8 bg-[#191919] antialiased [font-synthesis:none]">
      {children}
    </div>
  )
}

function TripwireLogo({ accent }: { accent?: boolean }) {
  return (
    <div
      className={accent ? "text-white" : "text-tw-text-secondary"}
      style={{ transition: "color 200ms ease" }}
    >
      <TripwireSparkIcon className="!h-16 !w-16" />
    </div>
  )
}

function Spinner() {
  return (
    <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
  )
}

function Dot() {
  return (
    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-tw-text-tertiary" />
  )
}

function humanScope(scope: string): string {
  const map: Record<string, string> = {
    openid: "Sign in as your Tripwire user",
    profile: "Read your name and avatar",
    email: "Read your email address",
    offline_access: "Stay connected while you're away",
  }
  return map[scope] ?? scope
}
