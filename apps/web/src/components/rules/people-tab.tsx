import { useState } from "react"
import { Button } from "#/components/ui/button"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "#/components/ui/toast"
import { Plus } from "#/components/icons/plus"
import { PlusStrokeIcon11 } from "#/components/icons/app-chrome-icons"
import {
  PeopleSearchLoupeIcon16,
  ContributorSuggestionCheckIcon14,
  PeopleListShieldHintIcon13,
  VouchedShieldCheckHintIcon13,
} from "#/components/icons/people-tab-icons"

interface PeopleUser {
  username: string
  avatarUrl: string
  reason?: string | null
  addedBy?: string | null
  addedAt?: string | null
}

interface SuggestedContributor {
  username: string
  avatarUrl: string
  contributions: number
}

interface PeopleTabProps {
  blacklistUsers: PeopleUser[]
  whitelistUsers: PeopleUser[]
  suggestedContributors?: SuggestedContributor[]
  onAddBlacklist: (username: string, reason?: string) => Promise<void>
  onRemoveBlacklist: (username: string) => Promise<void>
  onAddWhitelist: (username: string, reason?: string) => Promise<void>
  onRemoveWhitelist: (username: string) => Promise<void>
  isAddingBlacklist?: boolean
  isAddingWhitelist?: boolean
  isAdmin?: boolean
}

export function PeopleTab({
  blacklistUsers,
  whitelistUsers,
  suggestedContributors,
  onAddBlacklist,
  onRemoveBlacklist,
  onAddWhitelist,
  onRemoveWhitelist,
  isAddingBlacklist,
  isAddingWhitelist,
  isAdmin,
}: PeopleTabProps) {
  const [subtab, setSubtab] = useState<"block" | "allow" | "vouched">("block")
  const [dismissed, setDismissed] = useState(false)
  const [addingAll, setAddingAll] = useState(false)
  const [search, setSearch] = useState("")
  const [username, setUsername] = useState("")
  const [reason, setReason] = useState("")
  const [hasError, setHasError] = useState(false)

  const users = subtab === "block" ? blacklistUsers : whitelistUsers
  const isAdding = subtab === "block" ? isAddingBlacklist : isAddingWhitelist
  const q = search.toLowerCase()
  const filtered = q
    ? users.filter((u) => u.username.toLowerCase().includes(q))
    : users

  const handleAdd = async () => {
    const clean = username.trim().replace(/^@/, "")
    if (!clean) return
    setHasError(false)
    try {
      if (subtab === "block") {
        await onAddBlacklist(clean, reason.trim() || undefined)
      } else {
        await onAddWhitelist(clean, reason.trim() || undefined)
      }
      setUsername("")
      setReason("")
    } catch (err) {
      setHasError(true)
      toastFromError(err, { fallbackTitle: "Failed to add user" })
    }
  }

  const handleMove = async (user: PeopleUser) => {
    const fromLabel = subtab === "block" ? "blocklist" : "allowlist"
    const toLabel = subtab === "block" ? "allowlist" : "blocklist"
    const removeFromSource =
      subtab === "block" ? onRemoveBlacklist : onRemoveWhitelist
    const addToDest = subtab === "block" ? onAddWhitelist : onAddBlacklist
    const revertAddToSource =
      subtab === "block" ? onAddBlacklist : onAddWhitelist

    try {
      await removeFromSource(user.username)
    } catch (err) {
      toastFromError(err, {
        fallbackTitle: `Failed to remove from ${fromLabel}`,
      })
      return
    }

    try {
      await addToDest(user.username)
    } catch (err) {
      toastFromError(err, { fallbackTitle: `Failed to add to ${toLabel}` })
      // Best-effort revert: re-add to source list so the user isn't left on neither.
      try {
        await revertAddToSource(user.username)
      } catch (revertErr) {
        toastFromError(revertErr, {
          fallbackTitle: `Failed to restore user to ${fromLabel} after move error`,
        })
      }
    }
  }

  const handleRemove = (user: PeopleUser) => {
    const remove = subtab === "block" ? onRemoveBlacklist : onRemoveWhitelist
    const fromLabel = subtab === "block" ? "blocklist" : "allowlist"
    remove(user.username).catch((err) => {
      toastFromError(err, {
        fallbackTitle: `Failed to remove from ${fromLabel}`,
      })
    })
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {/* Header: tabs + search */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-[10px] bg-tw-card p-1">
          {[
            {
              key: "block" as const,
              label: "Always block",
              count: blacklistUsers.length,
            },
            {
              key: "allow" as const,
              label: "Always allow",
              count: whitelistUsers.length,
            },
            ...(isAdmin
              ? [
                  {
                    key: "vouched" as const,
                    label: "Vouched",
                    count: null as number | null,
                  },
                ]
              : []),
          ].map(({ key, label, count }) => (
            <Button
              variant="ghost"
              key={key}
              type="button"
              onClick={() => {
                setSubtab(key)
                setSearch("")
              }}
              className={`flex h-7 cursor-pointer items-center gap-1.5 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${
                subtab === key
                  ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                  : "text-[#9F9FA9] hover:text-[#EEEEEE]"
              }`}
            >
              {label}
              {count !== null && (
                <span className="ml-0.5 text-[11px] text-[#6E6E6E] tabular-nums">
                  {count}
                </span>
              )}
            </Button>
          ))}
        </div>
        <div className="flex h-9 w-[200px] items-center gap-2 rounded-[10px] bg-tw-card px-2.5">
          <PeopleSearchLoupeIcon16 />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search always ${subtab}`}
            className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
          />
        </div>
      </div>

      {subtab === "vouched" ? (
        <VouchedSubtab />
      ) : (
        <>
          {/* Add form */}
          <div className="rounded-[10px] bg-tw-card p-1">
            <div className="flex h-9 items-center gap-2 px-2.5">
              <span className="shrink-0 text-[12px] text-[#6E6E6E]">
                {subtab === "block" ? "Block" : "Allow"}
              </span>
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (hasError) setHasError(false)
                }}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="@username"
                className="flex-1 bg-transparent text-[13px] text-[#EEEEEE] outline-none placeholder:text-[#6E6E6E]"
              />
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="Reason (optional)"
                className="w-[180px] border-l border-[#FAFAFA14] bg-transparent pl-2.5 text-[13px] text-[#B4B4B4] outline-none placeholder:text-[#6E6E6E]"
              />
              <Button
                variant="default"
                size="sm"
                type="button"
                disabled={!username.trim() || isAdding}
                onClick={handleAdd}
                className="flex items-center gap-1 text-[12px] font-medium transition-colors"
              >
                <Plus />
                {subtab === "block" ? "Block" : "Allow"}
              </Button>
            </div>
          </div>

          {/* Suggestion banner — only on allow tab */}
          {subtab === "allow" &&
            !dismissed &&
            suggestedContributors &&
            suggestedContributors.length > 0 && (
              <div className="flex flex-col gap-2 rounded-xl bg-tw-card p-3">
                <div className="flex items-center gap-2">
                  <ContributorSuggestionCheckIcon14 />
                  <span className="text-[13px] text-tw-text-primary">
                    We found {suggestedContributors.length} contributor
                    {suggestedContributors.length !== 1 ? "s" : ""} with merged
                    commits to this repo
                  </span>
                </div>
                <div className="flex items-center gap-1 pl-[22px]">
                  {suggestedContributors.slice(0, 5).map((c) => (
                    <img
                      key={c.username}
                      src={c.avatarUrl}
                      alt={c.username}
                      title={`@${c.username} (${c.contributions} commits)`}
                      className="size-6 rounded-full"
                    />
                  ))}
                  {suggestedContributors.length > 5 && (
                    <span className="ml-1 text-[11px] text-tw-text-muted">
                      +{suggestedContributors.length - 5} more
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 pl-[22px]">
                  <Button
                    variant="default"
                    type="button"
                    size="sm"
                    disabled={addingAll}
                    onClick={async () => {
                      setAddingAll(true)
                      try {
                        for (const c of suggestedContributors) {
                          await onAddWhitelist(
                            c.username,
                            "Existing contributor"
                          ).catch(() => {})
                        }
                        setDismissed(true)
                      } finally {
                        setAddingAll(false)
                      }
                    }}
                    className="text-[12px] font-medium transition-colors disabled:opacity-50"
                  >
                    {addingAll ? "Adding..." : "Add all to allowlist"}
                  </Button>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="text-[12px] font-medium transition-colors"
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            )}

          {/* Helper text */}
          <div className="-mt-1.5 flex items-center gap-2 px-1">
            <PeopleListShieldHintIcon13
              variant={subtab === "block" ? "block" : "allow"}
            />
            <span className="text-[12px] text-[#6E6E6E]">
              {subtab === "block"
                ? "These users are blocked before any rule runs. They never reach your repos."
                : "These users bypass all rules. Their contributions are always accepted."}
            </span>
          </div>

          {/* User list */}
          {filtered.length > 0 ? (
            <div className="flex flex-col gap-1 rounded-xl bg-tw-card p-1">
              {filtered.map((user) => (
                <div
                  key={user.username}
                  className="group flex h-14 items-center gap-3 rounded-[8px] px-2.5 hover:bg-[#FAFAFA14]"
                >
                  <img
                    src={user.avatarUrl}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded-full"
                  />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[13px] leading-5 font-medium text-[#EEEEEE]">
                        @{user.username}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 truncate text-[11px] text-[#6E6E6E]">
                      {user.reason && (
                        <span className="max-w-[360px] truncate">
                          {user.reason}
                        </span>
                      )}
                      {user.reason && user.addedAt && <span>·</span>}
                      {user.addedAt && (
                        <span className="whitespace-nowrap">
                          {user.addedBy ? (
                            <>
                              added by{" "}
                              <span className="text-[#9F9FA9]">
                                {user.addedBy}
                              </span>{" "}
                              ·{" "}
                            </>
                          ) : null}
                          {user.addedAt}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      type="button"
                      size="sm"
                      onClick={() => handleMove(user)}
                      className="text-[11px]"
                    >
                      Move to {subtab === "block" ? "allowlist" : "blocklist"}
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      size="sm"
                      onClick={() => handleRemove(user)}
                      className="text-[11px]"
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl bg-tw-card p-6 text-center">
              <p className="text-[13px] text-[#6E6E6E]">
                {search
                  ? `No users match "${search}"`
                  : `No users on the ${subtab === "block" ? "blocklist" : "allowlist"} yet.`}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function VouchedSubtab() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [username, setUsername] = useState("")
  const [reason, setReason] = useState("")

  const vouchQuery = useQuery({
    ...trpc.vouches.list.queryOptions({ limit: 100 }),
  })

  const addVouch = useMutation(
    trpc.vouches.add.mutationOptions({
      onSuccess: () => {
        setUsername("")
        setReason("")
        queryClient.invalidateQueries({
          queryKey: trpc.vouches.list.queryKey(),
        })
        toastManager.add({ type: "success", title: "User vouched" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to vouch" }),
    })
  )

  const removeVouch = useMutation(
    trpc.vouches.remove.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.vouches.list.queryKey(),
        })
        toastManager.add({ type: "success", title: "Vouch removed" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to remove vouch" }),
    })
  )

  const users = vouchQuery.data?.users ?? []

  const handleAdd = () => {
    const clean = username.trim().replace(/^@/, "")
    if (!clean) return
    addVouch.mutate({
      githubUsername: clean,
      reason: reason.trim() || undefined,
    })
  }

  return (
    <>
      {/* Add form */}
      <div className="rounded-[10px] bg-tw-card p-1">
        <div className="flex h-9 items-center gap-2 px-2.5">
          <span className="shrink-0 text-[12px] text-[#6E6E6E]">Vouch</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="@username"
            className="flex-1 bg-transparent text-[13px] text-[#EEEEEE] outline-none placeholder:text-[#6E6E6E]"
          />
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="Reason (optional)"
            className="w-[180px] border-l border-[#FAFAFA14] bg-transparent pl-2.5 text-[13px] text-[#B4B4B4] outline-none placeholder:text-[#6E6E6E]"
          />
          <Button
            variant="ghost"
            type="button"
            disabled={!username.trim() || addVouch.isPending}
            onClick={handleAdd}
            className={`flex h-7 cursor-pointer items-center gap-1 rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${
              username.trim()
                ? "bg-[#FAFAFA1A] text-[#EEEEEE] hover:bg-[#FAFAFA2A]"
                : "cursor-not-allowed bg-[#FAFAFA14] text-[#6E6E6E]"
            }`}
          >
            <PlusStrokeIcon11 />
            Vouch
          </Button>
        </div>
      </div>

      {/* Helper text */}
      <div className="-mt-1.5 flex items-center gap-2 px-1">
        <VouchedShieldCheckHintIcon13 />
        <span className="text-[12px] text-[#6E6E6E]">
          Globally vouched users can be auto-trusted across repos that opt in.
        </span>
      </div>

      {/* Vouched user list */}
      {vouchQuery.isPending ? (
        <div className="flex items-center justify-center py-8">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
        </div>
      ) : users.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-xl bg-tw-card p-1">
          {users.map((user) => (
            <div
              key={user.githubUsername}
              className="group flex h-14 items-center gap-3 rounded-[8px] px-2.5 hover:bg-[#FAFAFA14]"
            >
              <img
                src={
                  user.avatarUrl ||
                  `https://github.com/${user.githubUsername}.png`
                }
                alt=""
                className="h-8 w-8 shrink-0 rounded-full"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] leading-5 font-medium text-[#EEEEEE]">
                  @{user.githubUsername}
                </span>
                <span className="text-[11px] text-[#6E6E6E]">
                  {user.vouchCount} vouch{user.vouchCount !== 1 ? "es" : ""}
                </span>
              </div>
              <Button
                variant="ghost"
                type="button"
                disabled={removeVouch.isPending}
                onClick={() =>
                  removeVouch.mutate({ githubUsername: user.githubUsername })
                }
                className="h-7 cursor-pointer rounded-[6px] px-2.5 text-[11px] text-[#B4B4B4] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#FAFAFA14] hover:text-[#F56D5D]"
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl bg-tw-card p-6 text-center">
          <p className="text-[13px] text-[#6E6E6E]">No vouched users yet.</p>
        </div>
      )}
    </>
  )
}
