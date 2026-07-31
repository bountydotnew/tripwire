import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"
import { Button } from "@tripwire/ui/button"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { toastFromError } from "#/lib/toast-error"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/request/$owner/$repo")({
  component: RequestPage,
  head: ({ match, params }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle(
        `Request access to ${params.owner}/${params.repo}`
      ),
      description: `Submit an unblock or access request to the maintainers of ${params.owner}/${params.repo}.`,
      robots: "noindex",
    }),
})

function RequestPage() {
  const { owner, repo } = Route.useParams()
  const [{ kind, u: intendedUser, ref, ct }, setSearch] = useQueryStates({
    kind: parseAsStringEnum(["unblock", "access"] as const).withDefault(
      "unblock"
    ),
    u: parseAsString,
    // The closed PR/issue this appeal is for, carried from the block comment's
    // appeal link so an approval can reopen the exact content.
    ref: parseAsInteger,
    ct: parseAsStringEnum(["pull_request", "issue"] as const),
  })
  const trpc = useTRPC()
  const { data: session, isPending } = authClient.useSession()

  const repoFullName = `${owner}/${repo}`
  const setKind = (next: "unblock" | "access") => setSearch({ kind: next })
  const [reason, setReason] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const { data: whoami } = useQuery({
    ...trpc.requests.whoami.queryOptions(),
    enabled: !!session,
    staleTime: 60 * 1000,
  })
  const currentGhLogin = whoami?.githubLogin ?? null

  const { data: vouch } = useQuery({
    ...trpc.vouches.check.queryOptions({ username: currentGhLogin ?? "" }),
    enabled: !!currentGhLogin,
    staleTime: 60 * 1000,
  })
  const mismatch =
    !!intendedUser &&
    !!currentGhLogin &&
    currentGhLogin.toLowerCase() !== intendedUser.toLowerCase()

  const submit = useMutation(
    trpc.requests.submit.mutationOptions({
      onSuccess: () => setSubmitted(true),
      onError: (e) =>
        toastFromError(e, { fallbackTitle: "Couldn't send your request" }),
    })
  )

  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: typeof window !== "undefined" ? window.location.href : "/",
    })
  }

  const handleSwitchAccount = async () => {
    const returnUrl = typeof window !== "undefined" ? window.location.href : "/"
    await authClient.signOut()
    await authClient.signIn.social({
      provider: "github",
      callbackURL: returnUrl,
    })
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    submit.mutate({
      repoFullName,
      kind,
      reason,
      // Only send the ref for unblock appeals — access requests aren't tied to
      // a specific PR/issue.
      ref: kind === "unblock" && ref ? ref : undefined,
      contentType: kind === "unblock" && ct ? ct : undefined,
    })
  }

  const canSubmit = reason.trim().length >= 10 && !submit.isPending

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tw-bg text-tw-text-primary">
      {/* Top bar */}
      <header className="flex h-12 shrink-0 items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2">
          <TripwireLogo className="h-5 w-5" />
          <span className="text-[14px] font-medium text-tw-text-primary">
            tripwire
          </span>
        </a>
      </header>

      {/* Inset content area */}
      <div className="min-h-0 flex-1 px-2 pb-2">
        <div
          className="tw-inset flex h-full justify-center overflow-auto"
          style={{ boxShadow: "#00000008 0px 1px 4px" }}
        >
          <div className="flex w-full max-w-[520px] flex-col gap-6 px-4 py-16">
            <header className="flex flex-col gap-1">
              <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em]">
                Request review
              </h1>
              <p className="m-0 text-[13px] text-[#FFFFFF99]">
                {repoFullName}
                {intendedUser ? (
                  <>
                    {" "}
                    · on behalf of{" "}
                    <span className="text-white">@{intendedUser}</span>
                  </>
                ) : null}
              </p>
            </header>

            {submitted ? (
              <div className="flex flex-col gap-2 rounded-xl border border-tw-border-card bg-tw-card p-5">
                <div className="text-[15px] font-medium">Request sent 🎉</div>
                <p className="m-0 text-[13px] text-[#FFFFFF99]">
                  The maintainers of {repoFullName} have it now. Keep an eye on
                  the thread — we'll post the result there as soon as they
                  review.
                </p>
              </div>
            ) : isPending ? (
              <div className="rounded-xl border border-tw-border-card bg-tw-card p-5">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
              </div>
            ) : !session ? (
              <div className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-5">
                <p className="m-0 text-[13px] text-[#FFFFFF99]">
                  Sign in with GitHub
                  {intendedUser ? ` as @${intendedUser}` : ""} so maintainers
                  know it's really you.
                </p>
                <Button onClick={handleLogin} className="self-start">
                  Sign in with GitHub
                </Button>
              </div>
            ) : mismatch ? (
              <div className="flex flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
                <div className="text-[14px] font-medium text-amber-200">
                  Wrong account
                </div>
                <p className="m-0 text-[13px] text-[#FFFFFFCC]">
                  This appeal is for{" "}
                  <span className="font-medium text-white">
                    @{intendedUser}
                  </span>
                  , but you're signed in as{" "}
                  <span className="font-medium text-white">
                    @{currentGhLogin}
                  </span>
                  . Switch to the right account to continue.
                </p>
                <div className="flex items-center gap-2">
                  <Button onClick={handleSwitchAccount}>
                    Sign in as @{intendedUser}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {vouch?.isVouched && (
                  <div className="flex items-center gap-3">
                    <div className="text-[13px] text-tw-text-secondary">
                      <span className="font-medium text-tw-text-primary">
                        You&apos;re vouched.
                      </span>{" "}
                      You have {vouch.vouchCount} vouch
                      {vouch.vouchCount !== 1 ? "es" : ""} from Tripwire
                      maintainers. Some repositories may auto-approve your
                      contributions.
                    </div>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-medium text-tw-text-secondary">
                      Request type
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(["unblock", "access"] as const).map((k) => (
                        <Button
                          key={k}
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() => setKind(k)}
                          className={`border px-3 py-1.5 text-[12px] whitespace-nowrap ${
                            kind === k
                              ? "border-tw-accent/30 bg-tw-accent/15 text-tw-accent"
                              : "border-tw-border bg-transparent text-tw-text-tertiary hover:border-tw-text-tertiary hover:text-tw-text-secondary"
                          }`}
                        >
                          {k === "unblock"
                            ? "Appeal a block"
                            : "Request access"}
                        </Button>
                      ))}
                    </div>
                    <p className="m-0 text-[12px] text-[#FFFFFF73]">
                      {kind === "unblock"
                        ? "Tripwire closed something you posted. Tell us what happened and a maintainer can take another look and lift the block."
                        : "Ask the maintainers to vouch for you so your future contributions come straight through."}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-medium text-tw-text-secondary">
                      Reason
                    </label>
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      rows={6}
                      placeholder="Tell us what you were working on and why it should be allowed — a sentence or two is plenty."
                      className="w-full resize-none rounded-lg border border-tw-border bg-tw-surface p-3 text-[13px] text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
                    />
                    <p className="m-0 text-[12px] text-[#FFFFFF59]">
                      {reason.trim().length}/2000 — minimum 10 characters.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={!canSubmit}
                    className="self-start"
                  >
                    {submit.isPending ? "Submitting…" : "Submit request"}
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
