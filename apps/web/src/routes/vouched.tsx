import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery } from "@tanstack/react-query"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"
import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@tripwire/ui/dialog"
import { toastFromError } from "#/lib/toast-error"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { GithubIcon } from "@tripwire/ui/icons/github"
import { buildSeoMeta, canonicalLink } from "#/lib/seo"
import {
  SearchLoupeOutlineIcon14,
  SmallXStrokeIcon12,
} from "@tripwire/ui/icons/app-chrome-icons"

export const Route = createFileRoute("/vouched")({
  component: VouchedUsersPage,
  head: () => ({
    meta: buildSeoMeta({
      title: "Vouched Contributors",
      description:
        "GitHub users verified by Tripwire maintainers. Vouched contributors can be auto-trusted across repositories.",
      path: "/vouched",
    }),
    links: [canonicalLink("/vouched")],
  }),
})

function VouchedUsersPage() {
  const trpc = useTRPC()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(0)
  const limit = 50

  const vouchQuery = useQuery({
    ...trpc.vouches.list.queryOptions({
      limit,
      offset: page * limit,
      search: search || undefined,
    }),
  })

  const users = vouchQuery.data?.users ?? []
  const total = vouchQuery.data?.total ?? 0
  const totalPages = Math.ceil(total / limit)

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-tw-bg text-tw-text-primary">
      {/* Top bar — matches app shell outset */}
      <header className="flex h-12 shrink-0 items-center justify-between px-4">
        <a href="/" className="flex items-center gap-2">
          <TripwireLogo className="h-5 w-5" />
          <span className="text-[14px] font-medium text-tw-text-primary">
            tripwire
          </span>
        </a>
        <a
          href="https://github.com/bountydotnew/tripwire"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
        >
          <GithubIcon className="h-5 w-5 text-white" />
        </a>
      </header>

      {/* Inset content area — matches app shell */}
      <div className="min-h-0 flex-1 px-2 pb-2">
        <div
          className="tw-inset h-full overflow-auto"
          style={{ boxShadow: "#00000008 0px 1px 4px" }}
        >
          <div className="mx-auto max-w-2xl px-4 py-12">
            {/* Header */}
            <header className="mb-4 flex items-start justify-between">
              <div className="flex flex-col gap-1">
                <h1 className="m-0 text-[22px] font-semibold tracking-[-0.02em] text-tw-text-primary">
                  Vouched contributors
                </h1>
                <p className="m-0 text-[13px] text-tw-text-tertiary">
                  {total} user{total !== 1 ? "s" : ""} vouched by Tripwire
                  maintainers
                </p>
              </div>
              <ApplyButton />
            </header>

            {/* Search */}
            <div className="mb-5">
              <div className="flex h-9 items-center gap-2 rounded-lg bg-tw-card px-2.5">
                <SearchLoupeOutlineIcon14 className="shrink-0 text-tw-text-tertiary" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(0)
                  }}
                  placeholder="Search users..."
                  className="flex-1 bg-transparent text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary"
                />
                {search && (
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setSearch("")
                      setPage(0)
                    }}
                    className="cursor-pointer text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
                  >
                    <SmallXStrokeIcon12 className="text-current" />
                  </Button>
                )}
              </div>
            </div>

            {/* List */}
            {vouchQuery.isPending ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
              </div>
            ) : users.length === 0 ? (
              <div className="rounded-xl bg-tw-card p-8 text-center">
                <p className="m-0 text-[13px] text-tw-text-tertiary">
                  {search
                    ? `No users matching "${search}"`
                    : "No vouched users yet."}
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-0.5 rounded-xl bg-tw-card p-1">
                {users.map((user) => (
                  <a
                    key={user.githubUsername}
                    href={`https://github.com/${user.githubUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex h-12 items-center gap-3 rounded-lg px-2.5 transition-colors hover:bg-tw-hover"
                  >
                    <img
                      src={
                        user.avatarUrl ||
                        `https://github.com/${user.githubUsername}.png`
                      }
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-tw-text-primary transition-colors group-hover:text-tw-accent">
                        @{user.githubUsername}
                      </span>
                    </div>
                    <span className="text-[11px] text-tw-text-tertiary tabular-nums">
                      {user.vouchCount} vouch{user.vouchCount !== 1 ? "es" : ""}
                    </span>
                  </a>
                ))}
              </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <span className="text-[11px] text-tw-text-tertiary tabular-nums">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} of{" "}
                  {total}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] text-tw-text-secondary transition-colors hover:bg-tw-card hover:text-tw-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Prev
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() =>
                      setPage((p) => Math.min(totalPages - 1, p + 1))
                    }
                    disabled={page >= totalPages - 1}
                    className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] text-tw-text-secondary transition-colors hover:bg-tw-card hover:text-tw-text-primary disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ApplyButton() {
  const trpc = useTRPC()
  const { data: session } = authClient.useSession()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState("")
  const [submitted, setSubmitted] = useState(false)

  const submit = useMutation(
    trpc.vouches.requestVouch.mutationOptions({
      onSuccess: () => setSubmitted(true),
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Request failed" }),
    })
  )

  const canSubmit = reason.trim().length >= 10 && !submit.isPending

  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL:
        typeof window !== "undefined" ? window.location.href : "/vouched",
    })
  }

  return (
    <>
      <Button size="xs" onClick={() => setOpen(true)} className="shrink-0">
        Apply to be vouched
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton
          className="w-full max-w-[400px] border-tw-border bg-tw-card p-0"
        >
          {submitted ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-4">
                <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
                  Request submitted
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 px-5 pb-5">
                <p className="m-0 text-[13px] text-tw-text-secondary">
                  An admin will review your request. You'll be added to the
                  directory if approved.
                </p>
                <Button
                  size="xs"
                  onClick={() => {
                    setOpen(false)
                    setSubmitted(false)
                    setReason("")
                  }}
                  className="self-start"
                >
                  Done
                </Button>
              </div>
            </>
          ) : !session ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-4">
                <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
                  Sign in to apply
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-3 px-5 pb-5">
                <p className="m-0 text-[13px] text-tw-text-secondary">
                  Connect your GitHub account so we can verify your identity.
                </p>
                <Button size="xs" onClick={handleLogin} className="self-start">
                  Sign in with GitHub
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader className="px-5 pt-5 pb-4">
                <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
                  Apply to be vouched
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 px-5 pb-5">
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-tw-text-secondary">
                    Why should you be vouched?
                  </label>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    placeholder="Share your GitHub contributions, projects, or any context that supports your request."
                    className="w-full resize-none rounded-lg border border-tw-border bg-tw-surface p-3 text-[13px] text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
                    autoFocus
                  />
                  <p className="m-0 text-[11px] text-tw-text-tertiary">
                    {reason.trim().length}/2000 — minimum 10 characters
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="xs"
                    onClick={() => submit.mutate({ reason })}
                    disabled={!canSubmit}
                  >
                    {submit.isPending ? "Submitting..." : "Submit request"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
