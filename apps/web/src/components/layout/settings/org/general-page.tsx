import { useState } from "react"
import { Link } from "@tanstack/react-router"
import { env } from "@tripwire/env/client"
import { useWorkspace } from "#/providers/workspace-context"

/**
 * Org-scoped general settings: appearance, GitHub App permissions, and a
 * pointer to the PR Comments page (where notification routing lives).
 */
export function OrgGeneralSettingsPage() {
  const appSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-dev"
  const configureUrl = `https://github.com/apps/${appSlug}/installations/new`
  const { org } = useWorkspace()
  const orgSlug = org?.slug

  return (
    <div className="flex flex-col gap-8">
      <SettingsSection
        title="Appearance"
        description="Choose how Tripwire looks to you."
      >
        <ThemePicker />
      </SettingsSection>

      <SettingsSection
        title="Repository access"
        description="Manage which GitHub organizations and repositories Tripwire can access."
      >
        <div className="rounded-xl bg-tw-card">
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="text-[13px] font-medium text-tw-text-primary">
                GitHub App permissions
              </div>
              <div className="mt-0.5 text-[12px] text-tw-text-muted">
                Configure installations, add new organizations, or revoke
                access.
              </div>
            </div>
            <a
              href={configureUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-tw-hover"
            >
              Configure
            </a>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Where Tripwire sends digests and alerts."
      >
        <div className="rounded-xl bg-tw-card p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-medium text-tw-text-primary">
                PR comment preferences
              </div>
              <div className="mt-0.5 text-[12px] text-tw-text-muted">
                Routing, Slack and Discord webhooks, and email digests now live
                on the PR Comments page.
              </div>
            </div>
            {orgSlug ? (
              <Link
                to="/$orgHandle/settings/pr-comments"
                params={{ orgHandle: orgSlug }}
                className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-tw-hover"
              >
                Open
              </Link>
            ) : null}
          </div>
        </div>
      </SettingsSection>
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

function ThemePicker() {
  const [selected, setSelected] = useState<"light" | "dark" | "system">("dark")

  const themes = [
    {
      key: "light" as const,
      label: "Light",
      bg: "#FFFFFF",
      lines: ["#D4D4D8", "#E4E4E7"],
    },
    {
      key: "dark" as const,
      label: "Dark",
      bg: "#18181B",
      lines: ["#3F3F46", "#27272A"],
    },
    {
      key: "system" as const,
      label: "System",
      bg: "linear-gradient(135deg, #FFFFFF 50%, #18181B 50%)",
      lines: null,
    },
  ]

  return (
    <div className="flex gap-3">
      {themes.map((theme) => (
        // biome-ignore lint/correctness/noRestrictedElements: needed here because ui breaks without... todo: fix????
        <button
          key={theme.key}
          type="button"
          onClick={() => setSelected(theme.key)}
          className={`flex flex-col items-center gap-2 rounded-xl p-1 pb-2 transition-all ${
            selected === theme.key
              ? "ring-2 ring-tw-text-primary ring-offset-2 ring-offset-tw-bg"
              : "hover:ring-1 hover:ring-[#27272A] hover:ring-offset-1 hover:ring-offset-tw-bg"
          }`}
        >
          <div
            className="flex h-[72px] w-[140px] flex-col justify-center gap-2 rounded-lg px-4"
            style={{
              background: theme.bg,
            }}
          >
            {theme.lines ? (
              <>
                <div
                  className="h-2 w-16 rounded-sm"
                  style={{ background: theme.lines[0] }}
                />
                <div
                  className="h-2 w-24 rounded-sm"
                  style={{ background: theme.lines[1] }}
                />
              </>
            ) : (
              <>
                <div className="flex">
                  <div className="h-2 w-8 rounded-sm bg-[#D4D4D8]" />
                  <div className="h-2 w-8 rounded-sm bg-[#3F3F46]" />
                </div>
                <div className="flex">
                  <div className="h-2 w-12 rounded-sm bg-[#E4E4E7]" />
                  <div className="h-2 w-12 rounded-sm bg-[#27272A]" />
                </div>
              </>
            )}
          </div>
          <span className="text-[12px] font-medium text-tw-text-secondary">
            {theme.label}
          </span>
        </button>
      ))}
    </div>
  )
}

