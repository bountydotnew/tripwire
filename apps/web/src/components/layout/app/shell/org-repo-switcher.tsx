import { useWorkspace } from "#/providers/workspace-context"
import { GithubIcon } from "@tripwire/ui/icons/github"
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuItem,
  MenuSeparator,
} from "@tripwire/ui/menu"
import { useAuth } from "@tripwire/auth/components"
import { useState } from "react"
import {
  MenuChevronDownIcon10,
  PlusStrokeIcon11,
  SmallCheckStrokeIcon12,
} from "@tripwire/ui/icons/app-chrome-icons"
import { CreateOrgDialog } from "#/components/layout/app/orgs/create-org-dialog"

export function OrgSwitcher() {
  const { org, orgs, setOrg, isLoading } = useWorkspace()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
  }

  if (orgs.length === 0) {
    if (!isLoading) return null
    return (
      <span className="flex h-8 cursor-default items-center gap-1.5 rounded-[10px] bg-tw-card px-2.5 text-[13px] text-tw-text-tertiary">
        {org?.logo ? (
          <img src={org.logo} alt="" className="h-4 w-4 rounded-full" />
        ) : (
          <div
            className="relative size-5 shrink-0 overflow-hidden rounded-full bg-tw-card bg-cover bg-center opacity-70"
            style={{
              backgroundImage: user?.image
                ? `url('${user.image}')`
                : "url('https://i.pravatar.cc/80?img=12')",
            }}
          />
        )}
        <span className="max-w-[120px] truncate leading-none">
          {org?.name ?? "Loading…"}
        </span>
      </span>
    )
  }

  return (
    <Menu open={open} onOpenChange={handleOpenChange}>
      <MenuTrigger className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] bg-tw-card px-2.5 text-tw-text-muted transition-colors hover:text-tw-text-primary">
        {org?.logo ? (
          <img src={org.logo} alt="" className="h-4 w-4 rounded-full" />
        ) : (
          <div
            className="relative size-5 shrink-0 overflow-hidden rounded-full bg-tw-card bg-cover bg-center"
            style={{
              backgroundImage: user?.image
                ? `url('${user.image}')`
                : "url('https://i.pravatar.cc/80?img=12')",
            }}
          />
        )}
        <span className="max-w-[120px] truncate text-[13px] leading-none text-tw-text-primary">
          {org?.name ?? "Select org"}
        </span>
        <MenuChevronDownIcon10 className="text-tw-text-tertiary" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        className="w-[220px] max-w-[calc(100vw-1rem)] border-tw-border bg-tw-card"
      >
        {orgs.map((o) => (
          <MenuItem
            key={o.id}
            onClick={() => {
              setOrg(o)
            }}
            className="flex items-center justify-between"
          >
            <span className="flex min-w-0 items-center gap-2">
              {o.logo ? (
                <img src={o.logo} alt="" className="h-4 w-4 rounded-full" />
              ) : (
                <div
                  className="relative size-5 shrink-0 overflow-hidden rounded-full bg-tw-card bg-cover bg-center"
                  style={{
                    backgroundImage: user?.image
                      ? `url('${user.image}')`
                      : "url('https://i.pravatar.cc/80?img=12')",
                  }}
                />
              )}
              <span className="min-w-0 truncate">{o.name}</span>
            </span>
            {org?.id === o.id && (
              <SmallCheckStrokeIcon12 className="shrink-0 text-tw-accent" />
            )}
          </MenuItem>
        ))}
        <MenuSeparator />
        <MenuItem
          onClick={() => {
            setTimeout(() => setCreateOpen(true), 0)
          }}
          className="flex items-center gap-2 text-tw-text-secondary"
        >
          <PlusStrokeIcon11 className="text-tw-text-tertiary" />
          Create new org
        </MenuItem>
      </MenuPopup>
      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Menu>
  )
}

export function RepoSwitcher() {
  const { repo, repos, setRepo, isLoading } = useWorkspace()
  const [open, setOpen] = useState(false)

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
  }

  if (repos.length === 0) {
    if (isLoading) {
      return (
        <span className="flex h-8 cursor-default items-center gap-1.5 rounded-[10px] bg-tw-card px-2.5 text-[13px] text-tw-text-tertiary">
          <GithubIcon className="h-5 w-5 shrink-0 text-tw-text-primary opacity-70" />
          <span className="max-w-[160px] truncate leading-none">
            {repo?.name ?? "Loading repos…"}
          </span>
        </span>
      )
    }
    return (
      <span className="flex h-8 items-center rounded-[10px] bg-tw-card px-2.5 text-[13px] text-tw-text-tertiary">
        No repos
      </span>
    )
  }

  return (
    <Menu open={open} onOpenChange={handleOpenChange}>
      <MenuTrigger className="flex h-8 cursor-pointer items-center gap-1.5 rounded-[10px] bg-tw-card px-2.5 text-tw-text-muted transition-colors hover:text-tw-text-primary">
        <GithubIcon className="h-5 w-5 text-tw-text-primary" />
        <span className="max-w-[160px] truncate text-[13px] leading-none text-tw-text-primary">
          {repo?.name ?? "Select repo"}
        </span>
        <MenuChevronDownIcon10 className="text-tw-text-tertiary" />
      </MenuTrigger>
      <MenuPopup
        align="end"
        className="w-[360px] max-w-[calc(100vw-1rem)] border-tw-border bg-tw-card"
      >
        {repos.map((r) => (
          <MenuItem
            key={r.id}
            onClick={() => {
              setRepo(r)
            }}
            className="flex items-center justify-between gap-3"
            title={r.fullName}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate text-[12px] text-tw-text-primary">
                {r.fullName}
              </span>
            </span>
            {repo?.id === r.id && (
              <SmallCheckStrokeIcon12 className="shrink-0 text-tw-accent" />
            )}
          </MenuItem>
        ))}
      </MenuPopup>
    </Menu>
  )
}

export function OrgRepoSwitcher() {
  return (
    <div className="flex items-center gap-1.5">
      <OrgSwitcher />
      <RepoSwitcher />
    </div>
  )
}
