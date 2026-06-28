import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { Menu, MenuTrigger, MenuPopup, MenuItem } from "@tripwire/ui/menu"
import { toastManager } from "@tripwire/ui/toast"
import {
  EventPageExternalLinkIcon11,
  EventRuleResultGlyph,
  EventShieldStrokeIcon14,
  EventUserPlusStrokeIcon14,
} from "@tripwire/ui/icons/event-detail-icons"
import { RULE_META } from "@tripwire/db/schema/rule-meta"
import { useGitHubUserFormatted } from "#/hooks/use-github-user"
import type { RouterOutputs } from "#/integrations/trpc/router"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace, useWorkspacePath } from "#/providers/workspace-context"
import { invalidateListCaches } from "#/lib/cache"
import { isCustomRuleName, stripCustomRulePrefix } from "#/lib/custom-rules"
import {
  getContentTypeLabel,
  getEventTitle,
  githubRefUrl,
} from "#/lib/event-labels"
import {
  ContributorScoreBadge,
  ContributorScoreBar,
  ContributorScoreBarLoading,
  type ContributorScore,
} from "#/components/shared/contributor-score-bar"
import { GitHubMarkWhiteIcon20 } from "@tripwire/ui/icons/github-mark-icon"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import { formatRelativeTime } from "#/lib/format"
import { toastFromError } from "#/lib/toast-error"
import { severityDotColor } from "#/lib/severity-design"
import {
  evaluationSeverity,
  extractEvaluations,
  summarizeWorkflowResult,
  type RuleEvaluationView,
} from "#/lib/events/checks"

const routeApi = getRouteApi("/_app/$orgHandle/events/$eventId")

export function EventDetailPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-10 pb-8">
      <div className="h-4 w-24 animate-pulse rounded bg-white/5" />
      <div className="h-28 w-full animate-pulse rounded-xl bg-white/5" />
      <div className="h-48 w-full animate-pulse rounded-xl bg-white/5" />
    </div>
  )
}

export function EventDetailPage() {
  const { eventId } = routeApi.useParams()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repo } = useWorkspace()
  const eventsPath = useWorkspacePath("events")

  const eventQuery = useQuery({
    ...trpc.events.get.queryOptions({ eventId }),
    enabled: !!eventId,
  })

  const event = eventQuery.data
  const repoId = event?.repo?.id || repo?.id
  const targetUsername = event?.targetGithubUsername

  const blacklistQuery = useQuery({
    ...trpc.blacklist.list.queryOptions({ repoId: repoId || "" }),
    enabled: !!repoId,
  })
  const isAlreadyBlacklisted =
    blacklistQuery.data?.some((e) => e.githubUsername === targetUsername) ??
    false

  const githubUser = useGitHubUserFormatted(targetUsername ?? undefined)

  const scoreQuery = useQuery({
    ...trpc.reputation.getScore.queryOptions({
      repoId: repoId || "",
      username: targetUsername || "",
    }),
    enabled: !!repoId && !!targetUsername,
  })

  const blacklistMutation = useMutation({
    ...trpc.blacklist.add.mutationOptions(),
    onSuccess: () => {
      if (repoId) invalidateListCaches(queryClient, repoId)
      toastManager.add({
        type: "success",
        title: "User blacklisted",
        description: `@${targetUsername} has been added to the blacklist.`,
      })
    },
    onError: (err) =>
      toastFromError(err, { fallbackTitle: "Failed to blacklist" }),
  })

  const whitelistMutation = useMutation({
    ...trpc.whitelist.add.mutationOptions(),
    onSuccess: () => {
      if (repoId) invalidateListCaches(queryClient, repoId)
      toastManager.add({
        type: "success",
        title: "User whitelisted",
        description: `@${targetUsername} has been added to the whitelist.`,
      })
    },
    onError: (err) =>
      toastFromError(err, { fallbackTitle: "Failed to whitelist" }),
  })

  if (eventQuery.isPending) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
      </div>
    )
  }

  if (eventQuery.error || !event) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-4">
        <p className="text-tw-text-secondary">Event not found</p>
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate({ to: eventsPath })}
          className="text-tw-accent hover:underline"
        >
          Back to Events
        </Button>
      </div>
    )
  }

  const username = event.targetGithubUsername || "unknown"
  const user = githubUser.data
  const canAct = !!repoId && username !== "unknown"
  const sourceUrl = event.repo?.fullName
    ? githubRefUrl(event.repo.fullName, event.contentType, event.githubRef)
    : null
  const contentLabel = getContentTypeLabel(event.contentType)

  return (
    <div className="relative min-h-full pb-16">
      <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-4 pt-10 pb-8">
        <Link
          to={eventsPath}
          className="flex w-fit items-center gap-1.5 text-[13px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
        >
          <span>←</span> Events
        </Link>

        <EventHero
          event={event}
          username={username}
          canAct={canAct}
          isAlreadyBlacklisted={isAlreadyBlacklisted}
          blacklisting={blacklistMutation.isPending}
          whitelisting={whitelistMutation.isPending}
          onBlacklist={() => {
            if (canAct)
              blacklistMutation.mutate({
                repoId: repoId!,
                githubUsername: username,
              })
          }}
          onWhitelist={() => {
            if (canAct)
              whitelistMutation.mutate({
                repoId: repoId!,
                githubUsername: username,
              })
          }}
        />

        <Block label="Content">
          <div className="overflow-hidden rounded-[10px] bg-tw-inner">
            <div className="flex items-center gap-2 border-b border-tw-border px-3 py-2.5">
              <img
                src={user?.avatar || `https://github.com/${username}.png`}
                className="h-5 w-5 shrink-0 rounded-full"
                alt=""
              />
              <span className="shrink-0 text-[13px] text-tw-text-primary">
                @{username}
              </span>
              <span className="min-w-0 flex-1 truncate text-[12px] text-tw-text-tertiary">
                opened this{" "}
                {event.contentType ? contentLabel.toLowerCase() : "item"} ·{" "}
                {formatRelativeTime(event.createdAt)}
              </span>
              {sourceUrl && (
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-primary"
                >
                  View {contentLabel.toLowerCase()} ↗
                </a>
              )}
            </div>
            <pre className="m-0 px-3 py-2.5 font-mono text-[12.5px] leading-[20px] whitespace-pre-wrap text-tw-text-secondary">
              {event.description || "No content preview available."}
            </pre>
          </div>
        </Block>

        {event.ruleName && (
          <Block label="Rule trace">
            <RuleTraceRow
              label={formatRuleName(event.ruleName)}
              isCustom={isCustomRuleName(event.ruleName)}
              result={event.severity === "error" ? "blocked" : "flagged"}
            />
          </Block>
        )}

        <ContributorBlock
          username={username}
          user={user}
          isLoading={githubUser.isLoading}
          score={scoreQuery.data?.score ?? null}
        />

        <ChecksTimeline event={event} username={username} />
      </div>
    </div>
  )
}

type EventDoc = NonNullable<RouterOutputs["events"]["get"]>

/**
 * The full map of checks that ran for this PR/issue: every rule (pass / near-
 * miss / fail with its reason) from the pipeline run, then any workflow runs.
 */
function ChecksTimeline({
  event,
  username,
}: {
  event: EventDoc
  username: string
}) {
  // The outcome event in this pipeline run carries the full evaluations; fall
  // back to the opened event itself if it's the one with them.
  const outcome = [event, ...(event.pipelineEvents ?? [])].find(
    (e) => extractEvaluations(e.metadata).length > 0
  )
  const evaluations = outcome ? extractEvaluations(outcome.metadata) : []
  const runs = event.workflowRuns ?? []
  const time = formatRelativeTime(event.createdAt)

  return (
    <DetailsBlock label="Checks">
      <div className="flex flex-col gap-[3px]">
        <TimelineRow
          time={time}
          label={`${getContentTypeLabel(event.contentType)} received`}
          detail={`From @${username}`}
        />
        <TimelineRow
          time={time}
          label="Tripwire pipeline ran"
          detail={
            evaluations.length > 0
              ? `${evaluations.length} rule${evaluations.length === 1 ? "" : "s"} evaluated`
              : "Rules evaluated"
          }
        />
        {evaluations.map((evaluation) => (
          <CheckRow key={evaluation.rule} evaluation={evaluation} />
        ))}
        {runs.map((run) => (
          <TimelineRow
            key={run.id}
            time={formatRelativeTime(run.createdAt)}
            label={`Workflow: ${run.workflowName ?? "run"}`}
            detail={summarizeWorkflowResult(run.result) || run.status}
          />
        ))}
      </div>
    </DetailsBlock>
  )
}

function CheckRow({ evaluation }: { evaluation: RuleEvaluationView }) {
  const detail =
    evaluation.reason ??
    (evaluation.actual !== undefined && evaluation.threshold !== undefined
      ? `${evaluation.actual} vs ${evaluation.threshold}`
      : "")
  const status = evaluation.passed
    ? "pass"
    : evaluation.nearMiss
      ? "near-miss"
      : "fail"
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] bg-tw-inner p-2.5">
      <span
        className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityDotColor(evaluationSeverity(evaluation))}`}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-5 text-tw-text-primary">
          {formatRuleName(evaluation.rule)}
        </div>
        {detail && (
          <div className="text-[11px] text-tw-text-tertiary">{detail}</div>
        )}
      </div>
      <span className="shrink-0 text-[11px] text-tw-text-tertiary">
        {status}
      </span>
    </div>
  )
}

function EventHero({
  event,
  username,
  canAct,
  isAlreadyBlacklisted,
  blacklisting,
  whitelisting,
  onBlacklist,
  onWhitelist,
}: {
  event: EventDoc
  username: string
  canAct: boolean
  isAlreadyBlacklisted: boolean
  blacklisting: boolean
  whitelisting: boolean
  onBlacklist: () => void
  onWhitelist: () => void
}) {
  const ghUrl = buildGitHubRefUrl(
    event.repo?.fullName,
    event.githubRef,
    event.contentType
  )
  const isGitHubActivity = (event.action || "").startsWith("github_")

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <SeverityPill severity={event.severity || "warning"} />
        <span className="inline-flex items-center gap-1.5 rounded-md bg-tw-inner px-2 py-1 text-[11px] font-medium text-tw-text-secondary">
          {isGitHubActivity ? (
            <GitHubMarkWhiteIcon20 className="h-3 w-3 opacity-70" />
          ) : (
            <TripwireLogo size={12} className="text-tw-text-secondary" />
          )}
          {event.contentType
            ? getContentTypeLabel(event.contentType)
            : isGitHubActivity
              ? "Activity"
              : "Tripwire"}
        </span>
        <div className="flex-1" />
        <Menu>
          <MenuTrigger className="flex h-7 cursor-pointer items-center gap-1 rounded-md px-2 text-[13px] text-tw-text-tertiary transition-colors hover:bg-tw-inner hover:text-tw-text-primary">
            Actions
          </MenuTrigger>
          <MenuPopup align="end">
            <MenuItem
              variant="destructive"
              disabled={!canAct || isAlreadyBlacklisted || blacklisting}
              onClick={onBlacklist}
            >
              <EventShieldStrokeIcon14 />
              {isAlreadyBlacklisted
                ? "Already blacklisted"
                : `Blacklist @${username}`}
            </MenuItem>
            <MenuItem disabled={!canAct || whitelisting} onClick={onWhitelist}>
              <EventUserPlusStrokeIcon14 />
              Add to whitelist
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>

      <h1 className="m-0 text-[26px] leading-[34px] font-medium tracking-[-0.01em] text-tw-text-primary">
        {getEventTitle(event.action || "", event.severity, "Flagged activity")}
      </h1>

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-tw-text-tertiary">
        <span>{event.repo?.fullName || "unknown/repo"}</span>
        <span className="text-tw-border">·</span>
        <span>{formatRelativeTime(event.createdAt)}</span>
        {ghUrl && (
          <>
            <span className="text-tw-border">·</span>
            <a
              href={ghUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="group inline-flex items-center gap-1 transition-colors hover:text-tw-text-secondary"
            >
              View on GitHub
              <EventPageExternalLinkIcon11 className="opacity-60 transition-opacity group-hover:opacity-100" />
            </a>
          </>
        )}
      </div>
    </div>
  )
}

function ContributorBlock({
  username,
  user,
  isLoading,
  score,
}: {
  username: string
  user: ReturnType<typeof useGitHubUserFormatted>["data"]
  isLoading: boolean
  score: ContributorScore | null
}) {
  return (
    <Block label="Contributor">
      <div className="flex flex-col gap-3 rounded-[10px] bg-tw-inner p-3">
        <div className="flex items-center gap-3">
          <img
            src={user?.avatar || `https://github.com/${username}.png`}
            className="h-11 w-11 shrink-0 rounded-full"
            alt=""
          />
          <div className="min-w-0 flex-1">
            <Link
              to="/users/$username"
              params={{ username }}
              className="text-[14px] font-medium text-tw-text-primary transition-colors hover:text-tw-accent"
            >
              @{username}
            </Link>
            <div className="mt-0.5 truncate text-[12px] text-tw-text-tertiary">
              {isLoading
                ? "Loading…"
                : user
                  ? `Joined ${user.accountAge} ago · ${user.publicReposFormatted} public repos`
                  : "Could not load profile"}
            </div>
          </div>
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-primary"
          >
            GitHub ↗
          </a>
        </div>

        {(score || isLoading) && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] text-tw-text-tertiary">
                Trust score
              </span>
              {score && <ContributorScoreBadge total={score.total} />}
            </div>
            {score ? (
              <ContributorScoreBar score={score} />
            ) : (
              <ContributorScoreBarLoading />
            )}
          </div>
        )}

        {user && (
          <details className="group border-t border-tw-border pt-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary [&::-webkit-details-marker]:hidden">
              <span className="transition-transform group-open:rotate-90">
                ›
              </span>
              Profile signals
            </summary>
            <div className="pt-2">
              <ContributorStats user={user} />
            </div>
          </details>
        )}
      </div>
    </Block>
  )
}

function ContributorStats({
  user,
}: {
  user: NonNullable<ReturnType<typeof useGitHubUserFormatted>["data"]>
}) {
  const stats = [
    { label: "Account age", value: user.accountAge },
    { label: "Public repos", value: user.publicReposFormatted },
    { label: "Followers", value: user.followersFormatted },
    { label: "Total stars", value: user.totalStarsFormatted },
    { label: "Profile README", value: user.hasReadme ? "Yes" : "No" },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center justify-between py-1.5 text-[12px]"
        >
          <span className="text-tw-text-tertiary">{stat.label}</span>
          <span className="text-tw-text-secondary tabular-nums">
            {stat.value}
          </span>
        </div>
      ))}
    </div>
  )
}

function Block({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex w-full flex-col gap-1.5 overflow-hidden rounded-xl bg-tw-card p-1">
      <span className="px-2 pt-1.5 text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
        {label}
      </span>
      {children}
    </section>
  )
}

function DetailsBlock({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <details className="group w-full overflow-hidden rounded-xl bg-tw-card">
      <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-3 [&::-webkit-details-marker]:hidden">
        <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
          {label}
        </span>
        <span className="text-[13px] text-tw-text-tertiary transition-transform group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="px-1 pb-1">{children}</div>
    </details>
  )
}

function SeverityPill({ severity }: { severity: string }) {
  const conf: Record<string, { color: string; label: string }> = {
    error: { color: "#F56D5D", label: "High severity" },
    warning: { color: "#D1BC00", label: "Medium severity" },
    success: { color: "#67E19F", label: "Allowed" },
    info: { color: "#9F9FA9", label: "Info" },
  }
  const c = conf[severity] || conf.info
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-tw-inner px-2 py-1 text-[11px] font-medium text-tw-text-primary">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: c.color }}
      />
      {c.label}
    </span>
  )
}

function RuleTraceRow({
  label,
  isCustom,
  result,
}: {
  label: string
  isCustom: boolean
  result: "blocked" | "flagged"
}) {
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-tw-inner px-3 py-2.5">
      <EventRuleResultGlyph result={result} />
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-[13px] text-tw-text-primary">
          {label}
        </span>
        {isCustom && (
          <span className="shrink-0 rounded bg-tw-card px-1.5 py-0.5 text-[10px] font-medium text-tw-text-tertiary">
            Custom
          </span>
        )}
      </div>
      <span className="shrink-0 text-[12px] text-tw-text-tertiary capitalize">
        {result}
      </span>
    </div>
  )
}

function TimelineRow({
  time,
  label,
  detail,
}: {
  time: string
  label: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-[10px] bg-tw-inner p-2.5">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-tw-text-tertiary" />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-5 text-tw-text-primary">
          {label}
        </div>
        <div className="text-[11px] text-tw-text-tertiary">{detail}</div>
      </div>
      <span className="shrink-0 text-[11px] whitespace-nowrap text-tw-text-tertiary">
        {time}
      </span>
    </div>
  )
}

function formatRuleName(ruleName: string): string {
  if (isCustomRuleName(ruleName)) {
    return stripCustomRulePrefix(ruleName)
  }
  return (
    (RULE_META as Record<string, { name: string }>)[ruleName]?.name ?? ruleName
  )
}

function buildGitHubRefUrl(
  fullName: string | null | undefined,
  ref: string | null | undefined,
  contentType: string | null | undefined
): string | null {
  if (!fullName) return null
  const base = `https://github.com/${fullName}`
  if (!ref) return base
  const match = ref.match(/^#(\d+)(?:\/comment\/(\d+))?/)
  if (!match) return base
  const num = match[1]
  const commentId = match[2]
  const path = contentType === "pull_request" ? "pull" : "issues"
  if (commentId) return `${base}/${path}/${num}#issuecomment-${commentId}`
  return `${base}/${path}/${num}`
}
