import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "@tripwire/ui/button"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useAuth } from "@tripwire/auth/components"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import {
  Dialog,
  DialogTrigger,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from "@tripwire/ui/dialog"
import { SessionMonitorIcon16 } from "@tripwire/ui/icons/app-chrome-icons"
import {
  buildSeo,
  formatPageTitle,
  PRIVATE_ROUTE_HEADERS,
} from "#/lib/seo"

export const Route = createFileRoute("/_app/settings/account")({
  component: AccountSettingsPage,
  headers: () => PRIVATE_ROUTE_HEADERS,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Account"),
      description:
        "Manage your Tripwire profile, connected providers, active sessions, and account deletion.",
      robots: "noindex",
    }),
})

function AccountSettingsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const createdAt = (user as { createdAt?: string | Date }).createdAt
  const joinedDate = createdAt
    ? new Date(createdAt).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null

  const handleSignOut = async () => {
    // "Sign out everywhere" must revoke ALL sessions for this user, not just
    // the cookie on this device. better-auth's /revoke-sessions endpoint
    // deletes every session row for the current user (gated by
    // sensitiveSessionMiddleware, which only requires a valid session — no
    // re-auth in this version, 1.6.9). If it fails, surface the error and
    // let the user decide whether to still sign out locally as a fallback.
    try {
      const res = await authClient.revokeSessions()
      if (res.error) {
        const status = (res.error as { status?: number }).status
        if (status === 403) {
          // Some better-auth configs treat /revoke-sessions as a
          // fresh-session action — if a future upgrade enables that,
          // the server will respond 403 SESSION_NOT_FRESH.
          toastFromError(res.error, {
            fallbackTitle: "Re-authenticate to sign out everywhere",
          })
          return
        }
        toastFromError(res.error, {
          fallbackTitle: "Couldn't revoke other sessions",
        })
        const proceed =
          typeof window !== "undefined"
            ? window.confirm(
                "We couldn't sign you out on other devices. Sign out on this device only?"
              )
            : false
        if (!proceed) return
      }
    } catch (err) {
      toastFromError(err, {
        fallbackTitle: "Couldn't revoke other sessions",
      })
      const proceed =
        typeof window !== "undefined"
          ? window.confirm(
              "We couldn't sign you out on other devices. Sign out on this device only?"
            )
          : false
      if (!proceed) return
    }

    await authClient.signOut()
    navigate({ to: "/login" })
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Profile */}
      <SettingsSection
        title="Profile"
        description="Your personal info shown across Tripwire."
      >
        <div className="rounded-xl bg-tw-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="size-10 shrink-0 rounded-full bg-tw-hover bg-cover bg-center"
                style={{
                  backgroundImage: user.image
                    ? `url('${user.image}')`
                    : undefined,
                }}
              />
              <div>
                <div className="text-[14px] font-medium text-tw-text-primary">
                  {user.name ?? "Unknown"}
                </div>
                <div className="text-[12px] text-tw-text-muted">
                  {user.email}
                  {joinedDate ? ` · Member since ${joinedDate}` : ""}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>

      {/* Sessions */}
      <SettingsSection
        title="Sessions"
        description="Active sessions on this account."
      >
        <SessionsList />
      </SettingsSection>

      {/* Onboarding */}
      <SettingsSection
        title="Onboarding"
        description="Replay the welcome tour and pick a different main repo."
      >
        <ResetOnboardingRow />
      </SettingsSection>

      {/* Danger zone */}
      <SettingsSection
        title="Danger zone"
        description="Irreversible account actions."
      >
        <div className="divide-y divide-[#27272A] rounded-xl bg-tw-card">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-[13px] font-medium text-tw-text-primary">
                Sign out everywhere
              </div>
              <div className="mt-0.5 text-[12px] text-tw-text-muted">
                End all sessions across all devices.
              </div>
            </div>
            <Button
              variant="ghost"
              type="button"
              onClick={handleSignOut}
              className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-tw-hover"
            >
              Sign out
            </Button>
          </div>
          <DeleteAccountRow />
        </div>
      </SettingsSection>
    </div>
  )
}

function ResetOnboardingRow() {
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const mutation = useMutation(
    trpc.onboarding.reset.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.onboarding.getState.queryKey(),
        })
        navigate({ to: "/onboarding/step/1" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Couldn't reset onboarding" }),
    })
  )
  return (
    <div className="flex items-center justify-between rounded-xl bg-tw-card p-4">
      <div>
        <div className="text-[13px] font-medium text-tw-text-primary">
          Reset onboarding
        </div>
        <div className="mt-0.5 text-[12px] text-tw-text-muted">
          Wipes your setup answers and restarts the welcome flow.
        </div>
      </div>
      <Button
        variant="ghost"
        type="button"
        loading={mutation.isPending}
        onClick={() => mutation.mutate()}
        className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-tw-hover"
      >
        Reset
      </Button>
    </div>
  )
}

function DeleteAccountRow() {
  const [confirmText, setConfirmText] = useState("")
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const handleDelete = async () => {
    setIsDeleting(true)
    setDeleteError(null)
    try {
      const res = await authClient.deleteUser()
      if (res.error) {
        setDeleteError(res.error.message ?? "Failed to delete account.")
        setIsDeleting(false)
        return
      }
      window.location.href = "/login"
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete account."
      setDeleteError(msg)
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <div className="text-[13px] font-medium text-tw-text-primary">
          Delete account
        </div>
        <div className="mt-0.5 text-[12px] text-tw-text-muted">
          Permanently delete your Tripwire account and all associated data.
        </div>
      </div>
      <Dialog
        onOpenChange={() => {
          setConfirmText("")
          setDeleteError(null)
        }}
      >
        <DialogTrigger className="flex h-8 items-center rounded-lg border border-red-500/30 px-3 text-[13px] font-medium text-red-400 transition-colors hover:bg-red-500/10">
          Delete
        </DialogTrigger>
        <DialogPopup showCloseButton={false} className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account, repos, rules, and chat
              history. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="flex flex-col gap-3">
              {deleteError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12px] text-red-400">
                  {deleteError}
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label className="text-[12px] text-tw-text-muted">
                  Type{" "}
                  <span className="font-mono text-tw-text-secondary">
                    delete
                  </span>{" "}
                  to confirm
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="delete"
                  autoComplete="off"
                  className="h-9 w-full rounded-lg border border-[#27272A] bg-tw-inner px-2.5 text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary focus:border-red-500/50"
                />
              </div>
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            <DialogClose className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-hover">
              Cancel
            </DialogClose>
            <Button
              variant="ghost"
              type="button"
              disabled={confirmText !== "delete" || isDeleting}
              onClick={handleDelete}
              className="flex h-8 items-center rounded-lg bg-red-500 px-3 text-[13px] font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isDeleting ? "Deleting..." : "Delete my account"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </div>
  )
}

function SessionsList() {
  const { data: sessions, isPending } = useQuery({
    queryKey: ["auth", "sessions"],
    queryFn: async () => {
      const result = await authClient.listSessions()
      return result.data ?? []
    },
    staleTime: 30 * 1000,
  })

  if (isPending) {
    return (
      <div className="rounded-xl bg-tw-card p-4">
        <div className="flex items-center gap-3">
          <div className="size-4 rounded bg-white/5" />
          <div className="h-4 w-32 rounded bg-white/5" />
        </div>
      </div>
    )
  }

  const sessionList = (sessions ?? []) as Array<{
    id: string
    ipAddress?: string | null
  }>

  return (
    <div className="divide-y divide-[#27272A] rounded-xl bg-tw-card">
      {sessionList.length === 0 ? (
        <div className="p-4 text-[13px] text-tw-text-muted">
          No active sessions.
        </div>
      ) : (
        sessionList.map((session) => (
          <div
            key={session.id}
            className="flex items-center justify-between p-4"
          >
            <div className="flex items-center gap-3">
              <SessionMonitorIcon16 className="shrink-0 text-tw-text-muted" />
              <div>
                <div className="text-[13px] font-medium text-tw-text-primary">
                  Session
                </div>
                <div className="text-[12px] text-tw-text-muted">
                  {session.ipAddress ?? "Unknown location"}
                </div>
              </div>
            </div>
            <span className="text-[12px] font-medium text-green-400">
              Active
            </span>
          </div>
        ))
      )}
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[14px] font-semibold text-tw-text-primary">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] text-tw-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}
