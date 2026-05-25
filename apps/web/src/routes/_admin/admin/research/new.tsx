import { createFileRoute, Link, useNavigate } from "@tanstack/react-router"
import { useState, type FormEvent } from "react"
import { useMutation } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { useTRPC } from "#/integrations/trpc/react"
import { toastFromError } from "#/lib/toast-error"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/research/new")({
  component: NewResearchRunPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("New research run"),
      description: "Configure a new batch contributor research run.",
      robots: "noindex",
    }),
})

interface FieldProps {
  label: string
  hint?: React.ReactNode
  children: React.ReactNode
}

function NewResearchRunPage() {
  const trpc = useTRPC()
  const navigate = useNavigate()

  const [name, setName] = useState("")
  const [usernamesText, setUsernamesText] = useState("")
  const [cutoffDate, setCutoffDate] = useState("2022-11-30")
  const [prLimit, setPrLimit] = useState(100)
  const [repoFullName, setRepoFullName] = useState("")

  const kickoff = useMutation({
    ...trpc.research.kickoff.mutationOptions(),
    onSuccess: ({ runId }) => {
      navigate({ to: "/admin/research/$runId", params: { runId } })
    },
    onError: (err) => {
      toastFromError(err, { fallbackTitle: "Couldn't start research run" })
    },
  })

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const usernames = usernamesText
      .split(/[\s,]+/)
      .map((u) => u.trim())
      .filter((u) => u.length > 0)
    if (usernames.length === 0) return

    kickoff.mutate({
      name,
      usernames,
      cutoffDate: new Date(cutoffDate).toISOString(),
      prLimitPerUser: prLimit,
      repoFullName: repoFullName || undefined,
    })
  }

  const usernameCount = usernamesText
    .split(/[\s,]+/)
    .filter((u) => u.trim().length > 0).length

  return (
    <div className="mx-auto flex w-full max-w-[760px] flex-col gap-6 px-4 py-10 md:px-[50px]">
      <div className="flex flex-col gap-2">
        <Link
          to="/admin/research"
          className="text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
        >
          ← All runs
        </Link>
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[16px] font-semibold text-tw-text-primary">
            New Research Run
          </h1>
          <p className="m-0 text-[13px] text-tw-text-muted">
            Bulk-evaluate a contributor cohort against the rule pipeline.
          </p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border border-tw-border-card bg-tw-card p-4"
      >
        <Field label="Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. 200-user pilot"
            required
            className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 text-[13px] text-tw-text-primary transition-colors outline-none placeholder:text-tw-text-tertiary focus:border-tw-accent"
          />
        </Field>

        <Field
          label={`Usernames (${usernameCount})`}
          hint="One per line, or comma-separated."
        >
          <textarea
            value={usernamesText}
            onChange={(e) => setUsernamesText(e.target.value)}
            placeholder="octocat&#10;dependabot&#10;..."
            rows={10}
            required
            className="w-full resize-none rounded-lg border border-tw-border bg-tw-surface p-2.5 font-mono text-[13px] text-tw-text-primary transition-colors outline-none placeholder:text-tw-text-tertiary focus:border-tw-accent"
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field
            label="Cutoff date"
            hint={
              <>
                PRs before this date are labeled{" "}
                <code className="rounded bg-tw-inner px-1 py-0.5 font-mono text-tw-text-secondary">
                  pre_ai
                </code>
                ; on/after are{" "}
                <code className="rounded bg-tw-inner px-1 py-0.5 font-mono text-tw-text-secondary">
                  post_ai
                </code>
                .
              </>
            }
          >
            <input
              type="date"
              value={cutoffDate}
              onChange={(e) => setCutoffDate(e.target.value)}
              className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 text-[13px] text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
            />
          </Field>

          <Field label="PRs per user">
            <input
              type="number"
              min={1}
              max={500}
              value={prLimit}
              onChange={(e) => setPrLimit(Number(e.target.value))}
              className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 text-[13px] tabular-nums text-tw-text-primary transition-colors outline-none focus:border-tw-accent"
            />
          </Field>
        </div>

        <Field
          label="Tripwire repo context (optional)"
          hint={
            <>
              If set, evaluates each contributor against this repo's
              whitelist/blacklist/event history. Must be a repo the Tripwire
              GH App is installed on. Leave blank to evaluate globally.
            </>
          }
        >
          <input
            value={repoFullName}
            onChange={(e) => setRepoFullName(e.target.value)}
            placeholder="owner/repo"
            className="w-full rounded-lg border border-tw-border bg-tw-surface p-2.5 font-mono text-[13px] text-tw-text-primary transition-colors outline-none placeholder:text-tw-text-tertiary focus:border-tw-accent"
          />
        </Field>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="submit"
            size="xs"
            disabled={kickoff.isPending}
            loading={kickoff.isPending}
          >
            Start run
          </Button>
        </div>
      </form>
    </div>
  )
}

function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-tw-text-tertiary">{label}</label>
      {children}
      {hint ? (
        <p className="m-0 text-[11px] text-tw-text-tertiary">{hint}</p>
      ) : null}
    </div>
  )
}
