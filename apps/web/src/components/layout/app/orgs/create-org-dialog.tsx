import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { authClient } from "@tripwire/auth/client"
import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogPopup,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogPanel,
  DialogFooter,
  DialogClose,
} from "@tripwire/ui/dialog"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"
import { toastFromError } from "#/lib/toast-error"
import {
  ORG_SLUG_PATTERN,
  isReservedOrgSlug,
  slugify,
} from "#/constants/reserved-org-slugs"

interface CreateOrgDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

interface CreateOrgFormProps {
  onClose: () => void
}

interface SlugStatusProps {
  error: string | null
  checking: boolean
  available: boolean
}

const FORMAT_HINT =
  "Lowercase letters, numbers, and hyphens. 1–39 chars, starts with a letter or number."

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup
        bottomStickOnMobile={false}
        showCloseButton={false}
        className="max-w-sm"
      >
        {open ? (
          <CreateOrgForm onClose={() => onOpenChange(false)} />
        ) : null}
      </DialogPopup>
    </Dialog>
  )
}

function CreateOrgForm({ onClose }: CreateOrgFormProps) {
  const trpc = useTRPC()
  const { setOrg } = useWorkspace()
  const [name, setName] = useState("")
  const [slugOverride, setSlugOverride] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Slug is derived from name unless the user has typed into the slug field.
  const slug = slugOverride ?? slugify(name)

  const localError = ((): string | null => {
    if (slug.length === 0) return null
    if (!ORG_SLUG_PATTERN.test(slug)) return FORMAT_HINT
    if (isReservedOrgSlug(slug)) return "That URL is reserved by Tripwire."
    return null
  })()

  const remoteCheck = useQuery({
    ...trpc.orgs.checkSlugAvailable.queryOptions({ slug }),
    enabled: slug.length > 0 && localError === null,
    staleTime: 5_000,
  })

  const remoteError =
    remoteCheck.data && !remoteCheck.data.available
      ? remoteCheck.data.reason === "taken"
        ? "That URL is already taken."
        : remoteCheck.data.reason === "reserved"
          ? "That URL is reserved by Tripwire."
          : FORMAT_HINT
      : null

  const error = localError ?? remoteError
  const canSubmit =
    !submitting &&
    name.trim().length > 0 &&
    slug.length > 0 &&
    !error &&
    !remoteCheck.isFetching &&
    remoteCheck.data?.available === true

  const create = useMutation({
    mutationFn: async () => {
      const res = await authClient.organization.create({
        name: name.trim(),
        slug,
      })
      if (res.error) throw res.error
      return res.data
    },
    onSuccess: (data) => {
      if (data) {
        setOrg({
          id: data.id,
          name: data.name,
          slug: data.slug ?? slug,
          logo: data.logo ?? null,
        })
      }
      onClose()
    },
    onError: (err) =>
      toastFromError(err, { fallbackTitle: "Couldn't create organization" }),
    onSettled: () => setSubmitting(false),
  })

  const handleSubmit = () => {
    if (!canSubmit) return
    setSubmitting(true)
    create.mutate()
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create organization</DialogTitle>
        <DialogDescription>
          Group repos under a separate workspace. You'll be the owner.
        </DialogDescription>
      </DialogHeader>
      <DialogPanel>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-tw-text-muted">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              autoComplete="off"
              className="h-9 w-full rounded-lg border border-[#27272A] bg-tw-inner px-2.5 text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary focus:border-tw-accent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[12px] text-tw-text-muted">URL</label>
            <div className="flex items-stretch overflow-hidden rounded-lg border border-[#27272A] bg-tw-inner focus-within:border-tw-accent">
              <span className="flex items-center px-2.5 font-mono text-[12px] text-tw-text-muted">
                tripwire.dev/
              </span>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlugOverride(e.target.value.toLowerCase())}
                placeholder="acme"
                autoComplete="off"
                spellCheck={false}
                className="h-9 flex-1 bg-transparent pr-2.5 font-mono text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary"
              />
            </div>
            <SlugStatus
              error={error}
              checking={remoteCheck.isFetching}
              available={
                remoteCheck.data?.available === true && slug.length > 0
              }
            />
          </div>
        </div>
      </DialogPanel>
      <DialogFooter variant="default" side="end">
        <DialogClose className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-hover">
          Cancel
        </DialogClose>
        <Button
          variant="default"
          type="button"
          disabled={!canSubmit}
          loading={submitting}
          onClick={handleSubmit}
          className="flex h-8 items-center rounded-lg px-3 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          Create
        </Button>
      </DialogFooter>
    </>
  )
}

function SlugStatus({ error, checking, available }: SlugStatusProps) {
  if (error) return <span className="text-[11px] text-tw-error">{error}</span>
  if (checking)
    return (
      <span className="text-[11px] text-tw-text-muted">
        Checking availability…
      </span>
    )
  if (available)
    return <span className="text-[11px] text-tw-success">Available</span>
  return <span className="text-[11px] text-tw-text-muted">{FORMAT_HINT}</span>
}
