import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { Button } from "#/components/ui/button"
import { toastManager } from "#/components/ui/toast"
import { toastFromError } from "#/lib/toast-error"

export const Route = createFileRoute("/_app/settings/developers")({
  component: DevelopersSettingsPage,
})

function DevelopersSettingsPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  // Use the Tripwire org (GitHub installation), not the Better Auth org
  const orgsQuery = useQuery(trpc.orgs.list.queryOptions())
  const orgId = orgsQuery.data?.[0]?.id

  const [showCreate, setShowCreate] = useState(false)
  const [newKeyName, setNewKeyName] = useState("")
  const [revealedKey, setRevealedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const keysQuery = useQuery({
    ...trpc.apiKeys.list.queryOptions({ orgId: orgId ?? "" }),
    enabled: !!orgId,
  })

  const createKey = useMutation(
    trpc.apiKeys.create.mutationOptions({
      onSuccess: (data) => {
        setRevealedKey(data.key)
        setShowCreate(false)
        setNewKeyName("")
        queryClient.invalidateQueries({
          queryKey: trpc.apiKeys.list.queryKey(),
        })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to create key" }),
    })
  )

  const revokeKey = useMutation(
    trpc.apiKeys.revoke.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.apiKeys.list.queryKey(),
        })
        toastManager.add({ type: "success", title: "API key revoked" })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to revoke key" }),
    })
  )

  const handleCreate = () => {
    if (!orgId || !newKeyName.trim()) return
    createKey.mutate({ orgId, name: newKeyName.trim() })
  }

  const handleCopy = () => {
    if (!revealedKey) return
    navigator.clipboard.writeText(revealedKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const keys = keysQuery.data ?? []

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="API Keys"
        description="Create keys to access the Tripwire API programmatically. Keys are scoped to your organization."
      >
        {/* Revealed key banner */}
        {revealedKey && (
          <div className="flex flex-col gap-2 rounded-xl border border-tw-border-card bg-tw-card p-4">
            <div className="text-[13px] font-medium text-tw-text-primary">
              Your new API key
            </div>
            <p className="m-0 text-[12px] text-tw-text-muted">
              Copy this key now. You won't be able to see it again.
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-tw-inner px-3 py-2 font-mono text-[12px] text-tw-accent select-all">
                {revealedKey}
              </code>
              <Button size="xs" onClick={handleCopy} className="shrink-0">
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <Button
              variant="ghost"
              type="button"
              onClick={() => setRevealedKey(null)}
              className="mt-1 cursor-pointer self-start text-[11px] text-tw-text-tertiary hover:text-tw-text-secondary"
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Create form */}
        {showCreate ? (
          <div className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-4">
            <div className="text-[13px] font-medium text-tw-text-primary">
              New API key
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[12px] text-tw-text-secondary">Name</label>
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g. Vouched app, CI pipeline"
                className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 text-[13px] text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate()
                  if (e.key === "Escape") setShowCreate(false)
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="xs"
                onClick={handleCreate}
                disabled={!newKeyName.trim() || createKey.isPending}
              >
                {createKey.isPending ? "Creating..." : "Create key"}
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => {
                  setShowCreate(false)
                  setNewKeyName("")
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="xs"
            onClick={() => setShowCreate(true)}
            className="self-start"
          >
            Create API key
          </Button>
        )}

        {/* Keys list */}
        {keysQuery.isPending ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-4 text-[13px] text-tw-text-tertiary">
            No API keys yet.
          </div>
        ) : (
          <div className="divide-y divide-[#27272A] rounded-xl border border-tw-border-card bg-tw-card">
            {keys.map((key) => (
              <div
                key={key.id}
                className="group flex items-center justify-between p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium text-tw-text-primary">
                      {key.name}
                    </span>
                    <code className="font-mono text-[11px] text-tw-text-tertiary">
                      {key.keyPrefix}...
                    </code>
                  </div>
                  <div className="text-[11px] text-tw-text-tertiary">
                    {key.scopes}
                    {key.lastUsedAt && (
                      <>
                        {" "}
                        · last used{" "}
                        {new Date(key.lastUsedAt).toLocaleDateString()}
                      </>
                    )}
                    {!key.lastUsedAt && " · never used"}
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="ghost"
                  disabled={revokeKey.isPending}
                  onClick={() => revokeKey.mutate({ keyId: key.id })}
                  className="text-red-400 opacity-0 transition-opacity group-hover:opacity-100 hover:text-red-300"
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </SettingsSection>

      {/* TODO: Link to API reference in docs once it's written */}
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
