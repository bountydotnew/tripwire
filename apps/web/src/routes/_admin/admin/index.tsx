import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  FolderGit2,
  Loader2,
  ShieldAlert,
  Users,
} from "lucide-react"
import { useTRPC } from "#/integrations/trpc/react"
import { formatRelativeTime } from "#/lib/format"
import { buildSeo, formatPageTitle } from "#/lib/seo"

export const Route = createFileRoute("/_admin/admin/")({
  component: AdminOverviewPage,
  head: ({ match }) =>
    buildSeo({
      path: match.pathname,
      title: formatPageTitle("Admin overview"),
      description: "Tripwire admin dashboard.",
      robots: "noindex",
    }),
})

interface StatTileProps {
  label: string
  value: number | string
  Icon: typeof Users
  hint?: string
  tone?: "default" | "warning" | "error" | "success"
}

interface PanelProps {
  title: string
  hint?: string
  children: React.ReactNode
}

function AdminOverviewPage() {
  const trpc = useTRPC()
  const overview = useQuery(trpc.adminOverview.overview.queryOptions())
  const recent = useQuery(trpc.adminOverview.recentBlocks.queryOptions())

  const data = overview.data

  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-6 px-4 py-10 md:px-[50px]">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[16px] font-semibold text-tw-text-primary">
          Overview
        </h1>
        <p className="m-0 text-[13px] text-tw-text-muted">
          What's happening across every repo running Tripwire.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          label="Users"
          value={data?.users ?? "—"}
          Icon={Users}
          hint="Signed-up accounts"
        />
        <StatTile
          label="Orgs"
          value={data?.orgs ?? "—"}
          Icon={Building2}
          hint="GitHub installations"
        />
        <StatTile
          label="Repos"
          value={data?.repos ?? "—"}
          Icon={FolderGit2}
          hint="Protected repos"
        />
        <StatTile
          label="Contributors"
          value={data?.contributors ?? "—"}
          Icon={ShieldAlert}
          hint="Tracked reputation rows"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <StatTile
          label="Blocks 24h"
          value={data?.blocks24h ?? "—"}
          Icon={AlertTriangle}
          tone={data && data.blocks24h > 0 ? "error" : "default"}
        />
        <StatTile
          label="Near miss 24h"
          value={data?.nearMisses24h ?? "—"}
          Icon={AlertTriangle}
          tone={data && data.nearMisses24h > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Allows 24h"
          value={data?.allows24h ?? "—"}
          Icon={CheckCircle2}
          tone="success"
        />
        <StatTile
          label="Events 7d"
          value={data?.events7d ?? "—"}
          Icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Panel
          title="Active syncs"
          hint={`${data?.activeSyncs?.length ?? 0} in flight`}
        >
          {!data ? (
            <PanelLoading />
          ) : data.activeSyncs.length === 0 ? (
            <PanelEmpty>No syncs in flight right now.</PanelEmpty>
          ) : (
            <div className="divide-y divide-[#27272A]">
              {data.activeSyncs.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-tw-accent" />
                    <span className="truncate font-mono text-[12px] text-tw-text-primary">
                      {s.repoFullName}
                    </span>
                  </div>
                  <span
                    className={`font-mono text-[11px] ${s.status === "running" ? "text-tw-accent" : "text-tw-warning"}`}
                  >
                    {s.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel
          title="Low score contributors"
          hint="Active this week, lowest score first"
        >
          {!data ? (
            <PanelLoading />
          ) : data.lowScoreContributors.length === 0 ? (
            <PanelEmpty>No risky contributors active this week.</PanelEmpty>
          ) : (
            <div className="divide-y divide-[#27272A]">
              {data.lowScoreContributors.map((c) => (
                <Link
                  key={`${c.githubUsername}-${c.repoFullName ?? ""}`}
                  to="/admin/reputation"
                  className="group flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-tw-hover"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    {c.githubUserId ? (
                      <span
                        className="size-5 shrink-0 overflow-hidden rounded-full bg-tw-inner bg-cover bg-center"
                        style={{
                          backgroundImage: `url('https://avatars.githubusercontent.com/u/${c.githubUserId}?v=4&s=40')`,
                        }}
                      />
                    ) : null}
                    <span className="truncate font-mono text-[12px] text-tw-text-primary group-hover:text-tw-accent">
                      @{c.githubUsername}
                    </span>
                    <span className="truncate text-[11px] text-tw-text-tertiary">
                      {c.repoFullName ?? ""}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 font-mono text-[11px]">
                    <ScoreChip score={c.score} />
                    <span className="text-tw-error">
                      {c.totalBlocks}B
                    </span>
                    <span className="text-tw-success">{c.totalAllows}A</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Recent flagged events"
        hint="Blocks and near-misses across all repos, last 7d"
      >
        {recent.isLoading ? (
          <PanelLoading />
        ) : !recent.data || recent.data.length === 0 ? (
          <PanelEmpty>Nothing flagged this week. Quiet times.</PanelEmpty>
        ) : (
          <div className="divide-y divide-[#27272A]">
            {recent.data.map((e) => (
              <div
                key={e.id}
                className="flex items-center gap-3 px-3 py-2.5"
              >
                <span className="w-[100px] shrink-0 font-mono text-[11px] text-tw-text-tertiary">
                  {formatRelativeTime(e.createdAt)}
                </span>
                <ActionTag action={e.action} />
                <span className="w-[160px] shrink-0 truncate font-mono text-[12px] text-tw-text-primary">
                  @{e.targetGithubUsername ?? "?"}
                </span>
                <span className="w-[180px] shrink-0 truncate font-mono text-[11px] text-tw-text-tertiary">
                  {e.repoFullName ?? "?"}
                </span>
                <span className="w-[60px] shrink-0 font-mono text-[11px] text-tw-text-tertiary">
                  {e.githubRef ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12px] text-tw-text-secondary">
                  {e.description ?? "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  )
}

function StatTile({ label, value, Icon, hint, tone = "default" }: StatTileProps) {
  const valueTone =
    tone === "error"
      ? "text-tw-error"
      : tone === "warning"
        ? "text-tw-warning"
        : tone === "success"
          ? "text-tw-success"
          : "text-tw-text-primary"
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-tw-border-card bg-tw-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-tw-text-tertiary">{label}</span>
        <Icon className="size-3.5 text-tw-text-tertiary" />
      </div>
      <div
        className={`text-[20px] leading-none font-semibold tabular-nums ${valueTone}`}
      >
        {value}
      </div>
      {hint ? (
        <span className="text-[11px] text-tw-text-tertiary">{hint}</span>
      ) : null}
    </div>
  )
}

function Panel({ title, hint, children }: PanelProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-tw-border-card bg-tw-card">
      <div className="flex items-center justify-between border-b border-[#27272A] px-3 py-2">
        <span className="text-[13px] font-medium text-tw-text-primary">
          {title}
        </span>
        {hint ? (
          <span className="text-[11px] text-tw-text-tertiary">{hint}</span>
        ) : null}
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  )
}

function PanelEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-3 py-6 text-center text-[12px] text-tw-text-tertiary">
      {children}
    </div>
  )
}

function PanelLoading() {
  return (
    <div className="px-3 py-6 text-center text-[12px] text-tw-text-tertiary">
      Loading…
    </div>
  )
}

function ScoreChip({ score }: { score: number }) {
  const tone =
    score >= 75
      ? "text-tw-success"
      : score >= 41
        ? "text-tw-warning"
        : "text-tw-error"
  return <span className={`${tone}`}>{score}</span>
}

function ActionTag({ action }: { action: string }) {
  const tone =
    action === "pipeline_blocked" || action === "blacklist_blocked"
      ? "text-tw-error"
      : action === "rule_near_miss"
        ? "text-tw-warning"
        : "text-tw-text-tertiary"
  return (
    <span
      className={`w-[140px] shrink-0 font-mono text-[11px] tracking-wide ${tone}`}
    >
      {action}
    </span>
  )
}
