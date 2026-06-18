import { useEffect, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { toastManager } from "@tripwire/ui/toast"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import { useFormDirty } from "#/lib/forms"
import { SettingsSection } from "#/components/settings/settings-section"
import { ToggleRow } from "#/components/settings/toggle-row"
import { InputRow } from "#/components/settings/input-row"
import { TextareaRow } from "#/components/settings/textarea-row"
import { RadioRow } from "#/components/settings/radio-row"
import { PrCommentPreview } from "#/components/settings/pr-comment-preview"
import type { OrgPrCommentPreferences } from "@tripwire/db"

type RouteMode = OrgPrCommentPreferences["routeMode"]
type Tone = OrgPrCommentPreferences["tone"]
type EmailDigest = OrgPrCommentPreferences["emailDigest"]

export function OrgPrCommentsSettingsPage() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  const prefsQuery = useQuery(trpc.orgPrefs.get.queryOptions())
  const canEditQuery = useQuery(trpc.orgPrefs.canEdit.queryOptions())

  const [draft, setDraft] = useState<OrgPrCommentPreferences | null>(null)

  useEffect(() => {
    if (prefsQuery.data && !draft) setDraft(prefsQuery.data)
  }, [prefsQuery.data, draft])

  const baseline = prefsQuery.data ?? null
  const dirty = useFormDirty(draft, baseline)
  const canEdit = canEditQuery.data ?? false

  const updateMutation = useMutation(
    trpc.orgPrefs.update.mutationOptions({
      onSuccess: (row) => {
        queryClient.setQueryData(trpc.orgPrefs.get.queryKey(), row)
        setDraft(row)
        toastManager.add({ type: "success", title: "Changes applied" })
      },
      onError: (err) => toastFromError(err),
    })
  )

  if (!draft) {
    return (
      <div className="px-1 py-10 text-[13px] text-tw-text-muted">Loading…</div>
    )
  }

  const update = <K extends keyof OrgPrCommentPreferences>(
    key: K,
    value: OrgPrCommentPreferences[K]
  ) => setDraft({ ...draft, [key]: value })

  const scrollToPreview = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: "smooth", block: "center" })
    el.animate(
      [
        { boxShadow: "0 0 0 0 rgba(238,238,238,0.18)" },
        { boxShadow: "0 0 0 10px rgba(238,238,238,0)" },
      ],
      { duration: 800, easing: "ease-out" }
    )
  }

  const onSave = () => {
    if (!dirty || !canEdit) return
    const { betterAuthOrgId: _baOrgId, createdAt: _c, updatedAt: _u, ...rest } =
      draft
    updateMutation.mutate(rest)
  }

  const onDiscard = () => {
    if (baseline) setDraft(baseline)
  }

  return (
    <div className="flex flex-col gap-6 pb-20">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[20px] font-semibold tracking-[-0.012em] text-tw-text-primary">
            PR Comments
          </h2>
          <p className="mt-1 max-w-[560px] text-[13px] leading-snug text-tw-text-muted">
            Customize how Tripwire appears on your repository&rsquo;s pull
            requests, issues, and comments.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            onClick={onDiscard}
            disabled={!dirty || updateMutation.isPending}
            className="h-8 rounded-lg border border-tw-border px-3 text-[13px] font-medium text-tw-text-secondary transition-colors hover:bg-tw-card hover:text-tw-text-primary disabled:opacity-50"
          >
            Discard
          </Button>
          <Button
            onClick={onSave}
            disabled={!dirty || updateMutation.isPending || !canEdit}
            className="h-8 rounded-lg bg-tw-text-primary px-3.5 text-[13px] font-medium text-tw-bg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-tw-card disabled:text-tw-text-tertiary"
          >
            {updateMutation.isPending ? "Saving…" : "Apply changes"}
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
        <div className="flex flex-col gap-7">
          <SettingsSection
            title="Content"
            description="What appears in every Tripwire comment."
          >
            <ToggleRow
              title="Show reason"
              description="Include the rule's reason text in every comment."
              checked={draft.showReason}
              onCheckedChange={(v) => update("showReason", v)}
              disabled={!canEdit}
              onViewClick={() => scrollToPreview("preview-blocked")}
            />
            <ToggleRow
              title="Show rule name"
              description="Show the rule that triggered the action."
              checked={draft.showRuleName}
              onCheckedChange={(v) => update("showRuleName", v)}
              disabled={!canEdit}
              onViewClick={() => scrollToPreview("preview-blocked")}
            />
            <ToggleRow
              title="Show appeal link"
              description='Include a "Request a review" link on blocked PRs. Warned PRs never show an appeal link to avoid spamming the vouch queue.'
              checked={draft.showAppealLink}
              onCheckedChange={(v) => update("showAppealLink", v)}
              disabled={!canEdit}
              onViewClick={() => scrollToPreview("preview-blocked")}
            />
            <ToggleRow
              title="Show warning disclaimer"
              description="On warnings, add a note clarifying that no action was taken."
              checked={draft.showWarningDisclaimer}
              onCheckedChange={(v) => update("showWarningDisclaimer", v)}
              disabled={!canEdit}
              onViewClick={() => scrollToPreview("preview-warned")}
            />
          </SettingsSection>

          <SettingsSection
            title="Branding"
            description="How Tripwire identifies itself in the thread."
          >
            <InputRow
              title="Bot display name"
              description='Replaces "Tripwire" in the comment body. The GitHub username stays "tripwire-bot".'
              value={draft.botDisplayName}
              onValueChange={(v) => update("botDisplayName", v)}
              placeholder="Tripwire"
              maxLength={80}
              disabled={!canEdit}
            />
            <RadioRow<Tone>
              title="Tone"
              description="Voice of the standard messages."
              value={draft.tone}
              onValueChange={(v) => update("tone", v)}
              disabled={!canEdit}
              options={[
                { value: "formal", label: "Formal" },
                { value: "neutral", label: "Neutral", hint: "Recommended." },
                { value: "casual", label: "Casual" },
              ]}
            />
            <TextareaRow
              title="Custom footer text"
              description="Appended below the appeal link."
              value={draft.customFooterText ?? ""}
              onValueChange={(v) =>
                update("customFooterText", v.length > 0 ? v : null)
              }
              placeholder="Questions? Email security@acme.com"
              maxLength={500}
              disabled={!canEdit}
            />
          </SettingsSection>

          <SettingsSection
            title="Notifications and routing"
            description="Where Tripwire publishes verdicts and digests."
          >
            <RadioRow<RouteMode>
              title="Route mode"
              description="Where Tripwire publishes verdicts."
              value={draft.routeMode}
              onValueChange={(v) => update("routeMode", v)}
              disabled={!canEdit}
              options={[
                { value: "comment", label: "PR comment" },
                {
                  value: "check",
                  label: "GitHub Check",
                  suffix: "Coming soon",
                  disabled: true,
                },
                {
                  value: "both",
                  label: "Comment and Check",
                  suffix: "Coming soon",
                  disabled: true,
                },
                {
                  value: "silent",
                  label: "Silent",
                  hint: "Run the pipeline and log events. Do not touch GitHub.",
                },
              ]}
            />
            <InputRow
              title="Slack webhook URL"
              description="Where to send Tripwire alerts."
              meta="Coming soon"
              value={draft.slackWebhookUrl ?? ""}
              onValueChange={(v) =>
                update("slackWebhookUrl", v.length > 0 ? v : null)
              }
              placeholder="https://hooks.slack.com/services/..."
              disabled={!canEdit}
              type="url"
            />
            <InputRow
              title="Discord webhook URL"
              description="Where to send Tripwire alerts."
              meta="Coming soon"
              value={draft.discordWebhookUrl ?? ""}
              onValueChange={(v) =>
                update("discordWebhookUrl", v.length > 0 ? v : null)
              }
              placeholder="https://discord.com/api/webhooks/..."
              disabled={!canEdit}
              type="url"
            />
            <RadioRow<EmailDigest>
              title="Email digest"
              description="Periodic summary of events."
              value={draft.emailDigest}
              onValueChange={(v) => update("emailDigest", v)}
              disabled={!canEdit}
              options={[
                { value: "off", label: "Off" },
                { value: "daily", label: "Daily" },
                { value: "weekly", label: "Weekly" },
              ]}
            />
          </SettingsSection>
        </div>

        <aside className="flex flex-col gap-3.5 self-start xl:sticky xl:top-0">
          <PrCommentPreview
            kind="blocked"
            prefs={draft}
            id="preview-blocked"
          />
          <PrCommentPreview kind="warned" prefs={draft} id="preview-warned" />
          <p className="px-1 text-[12px] leading-snug text-tw-text-tertiary">
            Example user, repo, and reasons are fixtures. In production,
            Tripwire fills these in from the actual webhook event.
          </p>
        </aside>
      </div>
    </div>
  )
}
