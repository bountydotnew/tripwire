import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@tripwire/auth/client"
import { useAuth } from "@tripwire/auth/components"
import { Button } from "@tripwire/ui/button"
import { toastManager } from "@tripwire/ui/toast"
import { useWorkspace } from "#/providers/workspace-context"
import { toastFromError } from "#/lib/toast-error"

interface OrgMemberUser {
  name: string | null
  email: string | null
  image?: string | null
}

interface OrgMember {
  id: string
  role: string
  userId: string
  user: OrgMemberUser
}

interface OrgProfileSectionProps {
  orgId: string
  orgName: string
  orgSlug: string
  canEdit: boolean
}

interface MembersSectionProps {
  members: OrgMember[]
  currentMembership: OrgMember | null
  showEmails: boolean
  loading: boolean
}

interface SectionShellProps {
  title: string
  description: string
  children: React.ReactNode
}

interface FieldProps {
  label: string
  hint?: string
  children: React.ReactNode
}

interface RoleBadgeProps {
  role: string
}

/**
 * Org members + profile editor. Owners/admins can rename the org and
 * see member emails; regular members only see names. Invitations are
 * stubbed until the email package ships.
 */
export function OrgMembersPage() {
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
    <div className="flex flex-col gap-10">
      <OrgProfileSection
        key={org.id}
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
}: OrgProfileSectionProps) {
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
      // Better Auth's useListOrganizations subscribes to these atom keys.
      // Targeting them directly avoids a blanket cache invalidate.
      queryClient.invalidateQueries({
        queryKey: ["$sessionSignal", "list-organizations"],
      })
      queryClient.invalidateQueries({ queryKey: ["organizations"] })
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
            <span className="flex items-center bg-tw-inner px-2.5 font-mono text-[12px] text-tw-text-muted">
              tripwire.dev/
            </span>
            <span className="flex h-9 flex-1 items-center px-0 font-mono text-[13px] text-tw-text-primary">
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

function MembersSection({ members, showEmails, loading }: MembersSectionProps) {
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
      description="Invite new members by email, coming with the email package."
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

function SectionShell({ title, description, children }: SectionShellProps) {
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

function Field({ label, hint, children }: FieldProps) {
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

function RoleBadge({ role }: RoleBadgeProps) {
  const tone =
    role === "owner"
      ? "border-tw-accent/20 bg-tw-accent/10 text-tw-accent"
      : role === "admin"
        ? "border-tw-success/20 bg-tw-success/10 text-tw-success"
        : "border-tw-border bg-tw-inner text-tw-text-secondary"
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-medium capitalize ${tone}`}
    >
      {role}
    </span>
  )
}
