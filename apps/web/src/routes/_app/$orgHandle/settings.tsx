import { useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@tripwire/auth/client"
import { useAuth } from "@tripwire/auth/components"
import { Button } from "@tripwire/ui/button"
import { useWorkspace } from "#/lib/workspace-context"
import { toastFromError } from "#/lib/toast-error"
import { toastManager } from "#/components/ui/toast"

export const Route = createFileRoute("/_app/$orgHandle/settings")({
  component: OrgSettingsPage,
})

type OrgMember = {
  id: string
  role: string
  userId: string
  user: { name: string | null; email: string | null; image?: string | null }
}

function OrgSettingsPage() {
  const { org } = useWorkspace()
  const { user } = useAuth()

  const orgQuery = useQuery({
    queryKey: ["org.full", org?.id ?? ""],
    queryFn: async () => {
      if (!org) return null
      const res = await authClient.organization.getFullOrganization({
        query: { organizationId: org.id },
      })
      if (res.error) throw res.error
      return res.data
    },
    enabled: !!org,
  })

  if (!org) {
    return (
      <div className="px-6 py-10 text-[13px] text-tw-text-muted">
        No organization selected.
      </div>
    )
  }

  const members = (orgQuery.data?.members ?? []) as OrgMember[]
  const myMembership = user ? members.find((m) => m.userId === user.id) : null
  const myRole = myMembership?.role
  const canEdit = myRole === "owner" || myRole === "admin"
  const showEmails = canEdit

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-10 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-1.5">
        <h1 className="m-0 font-['Inter',system-ui,sans-serif] text-2xl leading-7 font-semibold text-[#FFFFFFEB] md:text-[28px]">
          Organization
        </h1>
        <p className="m-0 font-['Inter',system-ui,sans-serif] text-sm leading-5 text-tw-text-secondary">
          Settings for{" "}
          <span className="text-tw-text-primary">{org.name}</span>.
        </p>
      </div>

      <OrgProfileSection
        orgId={org.id}
        orgName={org.name}
        orgSlug={org.slug}
        canEdit={canEdit}
      />

      <MembersSection
        members={members}
        currentMembership={myMembership ?? null}
        showEmails={showEmails}
        loading={orgQuery.isLoading}
      />

      <InvitationsSection />
    </div>
  )
}

function OrgProfileSection({
  orgId,
  orgName,
  orgSlug,
  canEdit,
}: {
  orgId: string
  orgName: string
  orgSlug: string
  canEdit: boolean
}) {
  const [name, setName] = useState(orgName)
  const queryClient = useQueryClient()
  const dirty = name.trim().length > 0 && name.trim() !== orgName

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await authClient.organization.update({
        data: { name: name.trim() },
        organizationId: orgId,
      })
      if (res.error) throw res.error
      return res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org.full", orgId] })
      // Better Auth's useListOrganizations is keyed internally — invalidate
      // broadly so the workspace switcher picks up the new name.
      queryClient.invalidateQueries()
      toastManager.add({ type: "success", title: "Organization renamed" })
    },
    onError: (err) =>
      toastFromError(err, { fallbackTitle: "Couldn't rename organization" }),
  })

  return (
    <SectionShell
      title="Profile"
      description="Public name and URL for this organization."
    >
      <div className="flex flex-col gap-4 rounded-xl bg-tw-card p-4">
        <Field label="URL" hint="Locked. URL changes are coming later.">
          <div className="flex items-stretch overflow-hidden rounded-lg border border-tw-border bg-tw-inner">
            <span className="flex items-center bg-tw-inner px-2 font-mono text-[12px] text-tw-text-muted">
              tripwire.sh/
            </span>
            <span className="flex h-9 flex-1 items-center px-2 font-mono text-[13px] text-tw-text-primary">
              {orgSlug}
            </span>
          </div>
        </Field>

        <Field label="Name">
          {canEdit ? (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9 flex-1 rounded-lg border border-tw-border bg-tw-inner px-2.5 text-[13px] text-tw-text-primary outline-none placeholder:text-tw-text-muted focus:border-tw-accent"
              />
              <Button
                variant="default"
                size="sm"
                disabled={!dirty || mutation.isPending}
                loading={mutation.isPending}
                onClick={() => mutation.mutate()}
              >
                Save
              </Button>
            </div>
          ) : (
            <div className="flex h-9 items-center text-[13px] text-tw-text-secondary">
              {orgName}
            </div>
          )}
        </Field>
      </div>
    </SectionShell>
  )
}

function MembersSection({
  members,
  showEmails,
  loading,
}: {
  members: OrgMember[]
  currentMembership: OrgMember | null
  showEmails: boolean
  loading: boolean
}) {
  return (
    <SectionShell
      title={`Members${members.length > 0 ? ` (${members.length})` : ""}`}
      description="Everyone with access to this organization."
    >
      <div className="overflow-clip rounded-xl bg-tw-card">
        {loading ? (
          <div className="px-4 py-6 text-[13px] text-tw-text-muted">
            Loading members…
          </div>
        ) : members.length === 0 ? (
          <div className="px-4 py-6 text-[13px] text-tw-text-muted">
            No members yet.
          </div>
        ) : (
          <ul className="divide-y divide-tw-border">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <div
                    className="size-8 shrink-0 overflow-hidden rounded-full bg-tw-inner bg-cover bg-center"
                    style={{
                      backgroundImage: m.user?.image
                        ? `url('${m.user.image}')`
                        : undefined,
                    }}
                  />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-tw-text-primary">
                      {m.user?.name ?? "Unknown"}
                    </span>
                    {showEmails && m.user?.email ? (
                      <span className="truncate text-[11px] text-tw-text-muted">
                        {m.user.email}
                      </span>
                    ) : null}
                  </div>
                </div>
                <RoleBadge role={m.role} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  )
}

function InvitationsSection() {
  return (
    <SectionShell
      title="Invitations"
      description="Invite new members by email — coming with the email package."
    >
      <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-tw-border bg-tw-card/40 px-4 py-3">
        <div className="flex flex-col">
          <span className="text-[13px] font-medium text-tw-text-primary">
            Invite member
          </span>
          <span className="text-[11px] text-tw-text-muted">
            Will be enabled once Tripwire ships its email package.
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled
          aria-disabled
          className="opacity-50"
        >
          Coming soon
        </Button>
      </div>
    </SectionShell>
  )
}

function SectionShell({
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

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[12px] font-medium text-tw-text-secondary">
          {label}
        </span>
        {hint ? (
          <span className="text-[11px] text-tw-text-muted">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  )
}

function RoleBadge({ role }: { role: string }) {
  const tone =
    role === "owner"
      ? "text-tw-text-primary bg-tw-accent border-tw-accent"
      : role === "admin"
        ? "text-tw-text-primary bg-tw-error border-tw-error"
        : "text-tw-text-secondary bg-tw-inner border-tw-border"
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${tone}`}
    >
      {role}
    </span>
  )
}
