import { createFileRoute } from "@tanstack/react-router"
import { useState } from "react"
import { Button } from "#/components/ui/button"
import { env } from "@tripwire/env/client"

export const Route = createFileRoute("/_app/settings/general")({
  component: GeneralSettingsPage,
})

function GeneralSettingsPage() {
  const appSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-dev"
  const configureUrl = `https://github.com/apps/${appSlug}/installations/new`

  return (
    <div className="flex flex-col gap-8">
      {/* Appearance */}
      <SettingsSection
        title="Appearance"
        description="Choose how Tripwire looks to you."
      >
        <ThemePicker />
      </SettingsSection>

      {/* Repository access */}
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

      {/* Notifications */}
      <SettingsSection
        title="Notifications"
        description="Where Tripwire sends digests and alerts."
      >
        <div className="divide-y divide-[#27272A] rounded-xl bg-tw-card">
          <NotificationRow
            title="Daily digest"
            description="Summary email at 8:00am local"
            defaultChecked={true}
          />
          <NotificationRow
            title="High-severity events"
            description="Push to Slack #tripwire-alerts"
            defaultChecked={true}
          />
          <NotificationRow
            title="Weekly insights"
            description="Roundup of trends and rule efficacy"
            defaultChecked={false}
          />
          <NotificationRow
            title="Marketing & updates"
            description="Product news, occasionally"
            defaultChecked={false}
          />
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
        <Button
          variant="ghost"
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
        </Button>
      ))}
    </div>
  )
}

function NotificationRow({
  title,
  description,
  defaultChecked,
}: {
  title: string
  description: string
  defaultChecked: boolean
}) {
  const [checked, setChecked] = useState(defaultChecked)

  return (
    <div className="flex items-center justify-between p-4">
      <div>
        <div className="text-[13px] font-medium text-tw-text-primary">
          {title}
        </div>
        <div className="mt-0.5 text-[12px] text-tw-text-muted">
          {description}
        </div>
      </div>
      <Button
        variant="ghost"
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => setChecked(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? "bg-tw-text-primary" : "bg-[#27272A]"
        }`}
      >
        <span
          className={`inline-block size-3.5 rounded-full transition-transform ${
            checked
              ? "translate-x-[18px] bg-[#0D0D0F]"
              : "translate-x-[3px] bg-tw-text-muted"
          }`}
        />
      </Button>
    </div>
  )
}
