import { getRouteApi, Link, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { toastManager } from "@tripwire/ui/toast"
import {
  EventIssueDotCircleIcon12,
  EventPageExternalLinkIcon11,
  EventRuleResultGlyph,
  EventShieldCheckStrokeIcon14,
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
import { formatRelativeTime } from "#/lib/format"
import { toastFromError } from "#/lib/toast-error"

const routeApi = getRouteApi("/_app/$orgHandle/events/$eventId")

export function EventDetailPageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
      <div className="h-6 w-48 animate-pulse rounded bg-white/5" />
      <div className="h-32 w-full animate-pulse rounded-xl bg-white/5" />
      <div className="h-64 w-full animate-pulse rounded-xl bg-white/5" />
    </div>
  )
}

export function EventDetailPage() {
  const { eventId } = routeApi.useParams()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const { repo } = useWorkspace()
  const homePath = useWorkspacePath("home")
  const eventsPath = useWorkspacePath("events")

  const eventQuery = useQuery({
    ...trpc.events.get.queryOptions({ eventId }),
    enabled: !!eventId,
  })

  const event = eventQuery.data
  const repoId = event?.repo?.id || repo?.id

  const blacklistQuery = useQuery({
    ...trpc.blacklist.list.queryOptions({ repoId: repoId || "" }),
    enabled: !!repoId,
  })
  const targetUsername = event?.targetGithubUsername
  const isAlreadyBlacklisted =
    blacklistQuery.data?.some(
      (entry) => entry.githubUsername === targetUsername
    ) ?? false

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

  // Banner state derived from mutation success — no redundant useState.
  const actionBanner =
    blacklistMutation.isSuccess && targetUsername
      ? ({ kind: "blacklisted", username: targetUsername } as const)
      : whitelistMutation.isSuccess && targetUsername
        ? ({ kind: "safe", username: targetUsername } as const)
        : null

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

  const sevColor =
    event.severity === "error"
      ? "#F56D5D"
      : event.severity === "success"
        ? "#67E19F"
        : "#D1BC00"
  const username = event.targetGithubUsername || "unknown"
  const user = githubUser.data

  return (
    <div className="relative min-h-full pb-16">
      <div className="mx-auto flex w-[672px] max-w-2xl flex-col gap-5 px-4 pt-12 pb-8">
        <div className="flex items-center gap-1.5 text-[13px] text-tw-text-tertiary">
          <Link
            to={homePath}
            className="flex items-center gap-1 transition-colors hover:text-tw-text-secondary"
          >
            <span>←</span> Home
          </Link>
          <span className="text-[#363639]">/</span>
          <Link
            to={eventsPath}
            className="transition-colors hover:text-tw-text-secondary"
          >
            Events
          </Link>
          <span className="text-[#363639]">/</span>
          <span className="font-mono text-tw-text-secondary">
            {event.githubRef || eventId.slice(0, 8)}
          </span>
        </div>

        <EventHero
          event={event}
          eventId={eventId}
          sevColor={sevColor}
          username={username}
        />

        {actionBanner ? (
          <div className="flex items-center gap-2 px-2">
            <div className="flex items-center gap-2 rounded-[10px] bg-tw-inner px-3 py-2 text-[13px]">
              {actionBanner.kind === "blacklisted" ? (
                <>
                  <EventShieldStrokeIcon14 />
                  <span className="text-tw-text-primary">
                    @{actionBanner.username} has been blacklisted
                  </span>
                </>
              ) : (
                <>
                  <EventUserPlusStrokeIcon14 />
                  <span className="text-tw-text-primary">
                    @{actionBanner.username} added to whitelist
                  </span>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-2">
            {isAlreadyActioned(event.action) && (
              <div className="flex items-center gap-2 rounded-[10px] bg-tw-inner px-3 py-2 text-[13px] text-tw-text-secondary">
                <EventShieldCheckStrokeIcon14 />
                <span>
                  Tripwire {getActionedLabel(event.action, event.severity)}
                </span>
              </div>
            )}
            <ActionPill
              variant={isAlreadyActioned(event.action) ? "default" : "primary"}
              onClick={() => {
                if (repoId && username !== "unknown") {
                  blacklistMutation.mutate({ repoId, githubUsername: username })
                }
              }}
              disabled={blacklistMutation.isPending || isAlreadyBlacklisted}
            >
              <EventShieldStrokeIcon14 />
              {isAlreadyBlacklisted
                ? `@${username} is blacklisted`
                : blacklistMutation.isPending
                  ? "Adding..."
                  : `Blacklist @${username}`}
            </ActionPill>
            <ActionPill
              variant="ghost"
              onClick={() => {
                if (repoId && username !== "unknown") {
                  whitelistMutation.mutate({ repoId, githubUsername: username })
                }
              }}
              disabled={whitelistMutation.isPending}
            >
              <EventUserPlusStrokeIcon14 />
              {whitelistMutation.isPending ? "Adding..." : "Add to whitelist"}
            </ActionPill>
          </div>
        )}

        <Block label="Flagged content">
          <div className="flex flex-col gap-2.5 pt-1">
            <div className="px-1">
              <OutlineCard>
                <div className="flex items-center gap-2 px-0.5 py-0.5">
                  <img
                    src={user?.avatar || `https://github.com/${username}.png`}
                    className="h-[22px] w-[22px] shrink-0 rounded-full"
                    alt=""
                  />
                  <span className="text-[14px] leading-5 whitespace-nowrap text-tw-text-primary">
                    @{username}
                  </span>
                  <span className="text-[13px] whitespace-nowrap text-tw-text-tertiary">
                    opened this {event.contentType || "issue"}{" "}
                    {formatRelativeTime(event.createdAt)}
                  </span>
                </div>
              </OutlineCard>
            </div>
            <div className="rounded-[10px] bg-tw-inner p-3">
              <div className="mb-2 text-[14px] leading-5 text-tw-text-primary">
                Content flagged by Tripwire
              </div>
              <pre className="m-0 font-mono text-[12.5px] leading-[20px] whitespace-pre-wrap text-tw-text-secondary">
                {event.description || "No content preview available."}
              </pre>
            </div>
          </div>
        </Block>

        <Block
          label="Rule trace"
          note={`${event.ruleName ? "1 rule triggered" : "Rules evaluated"}`}
        >
          <div className="flex flex-col gap-[3px]">
            {event.ruleName ? (
              <>
                {isCustomRuleName(event.ruleName) && (
                  <div className="flex items-center gap-1.5 px-3 py-1">
                    <span className="rounded bg-purple-500/15 px-1.5 py-0.5 text-[11px] leading-none font-medium text-purple-300">
                      Custom Rule
                    </span>
                  </div>
                )}
                <RuleTraceRow
                  label={formatRuleName(event.ruleName)}
                  result={event.severity === "error" ? "blocked" : "flagged"}
                  detail="Rule triggered on this content"
                />
              </>
            ) : (
              <div className="rounded-[10px] bg-tw-inner px-3 py-2.5 text-[13px] text-tw-text-secondary">
                No rule trace available
              </div>
            )}
          </div>
        </Block>

        <ContributorBlock
          username={username}
          user={user}
          isLoading={githubUser.isLoading}
          sevColor={sevColor}
          score={scoreQuery.data?.score ?? null}
        />

        <Block label="Timeline" note="Event history">
          <div className="flex flex-col gap-[3px]">
            <TimelineRow
              time={formatRelativeTime(event.createdAt)}
              kind="opened"
              label={`${event.contentType || "Content"} received`}
              detail={`From @${username}`}
            />
            <TimelineRow
              time={formatRelativeTime(event.createdAt)}
              kind="pipeline"
              label="Tripwire pipeline started"
              detail="Rules evaluated"
            />
            {event.ruleName && (
              <TimelineRow
                time={formatRelativeTime(event.createdAt)}
                kind={event.severity === "error" ? "block" : "flag"}
                label={`${formatRuleName(event.ruleName)} → ${event.severity === "error" ? "blocked" : "flagged"}`}
                detail={event.description || "Rule triggered"}
              />
            )}
          </div>
        </Block>
      </div>
    </div>
  )
}

type EventDoc = NonNullable<RouterOutputs["events"]["get"]>

function EventHero({
  event,
  eventId,
  sevColor,
  username,
}: {
  event: EventDoc
  eventId: string
  sevColor: string
  username: string
}) {
  const fullName = event.repo?.fullName
  const ref = event.githubRef
  const ghUrl = buildGitHubRefUrl(fullName, ref, event.contentType)
  const refBody = (
    <>
      <EventIssueDotCircleIcon12 color={sevColor} />
      {fullName || "unknown/repo"}{" "}
      <span className="font-mono text-tw-text-secondary">{ref || "#???"}</span>
      {ghUrl ? (
        <EventPageExternalLinkIcon11 className="ml-0.5 opacity-60 transition-opacity group-hover:opacity-100" />
      ) : null}
    </>
  )

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl px-2 py-1">
      <div className="flex items-center gap-2">
        <SeverityPill severity={event.severity || "warning"} />
        <StatusChip status="open" />
        <span className="rounded bg-[#ffffff08] px-2 py-0.5 font-mono text-[11px] text-tw-text-tertiary">
          id: {eventId.slice(0, 8)}
        </span>
      </div>
      <h1
        className="m-0 text-[28px] leading-[36px] tracking-[-0.01em] text-tw-text-primary"
        style={{ fontFamily: "'Playfair Display', serif", fontWeight: 500 }}
      >
        {getEventTitle(event.action || "", event.severity)}
      </h1>
      <p className="m-0 max-w-[560px] text-[16px] leading-[24px] text-[#EEEEEE80]">
        {event.description || `Tripwire flagged activity from @${username}`}
      </p>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-[13px] text-tw-text-tertiary">
        {ghUrl ? (
          <a
            href={ghUrl}
            target="_blank"
            rel="noreferrer noopener"
            className="group flex items-center gap-1.5 transition-colors hover:text-tw-text-secondary"
          >
            {refBody}
          </a>
        ) : (
          <span className="flex items-center gap-1.5">{refBody}</span>
        )}
        <span className="text-[#363639]">·</span>
        <span>{formatRelativeTime(event.createdAt)}</span>
      </div>
    </div>
  )
}

function ContributorBlock({
  username,
  user,
  isLoading,
  sevColor,
  score,
}: {
  username: string
  user: ReturnType<typeof useGitHubUserFormatted>["data"]
  isLoading: boolean
  sevColor: string
  score: {
    total: number
    globalReputation: number
    communitySignals: number
    repoHistory: number
    redFlags: number
  } | null
}) {
  return (
    <Block
      label="Contributor"
      note={
        isLoading
          ? "Loading..."
          : user
            ? `${user.followersFormatted} followers`
            : "Error loading"
      }
    >
      <div className="flex flex-col gap-4 rounded-[10px] bg-tw-inner p-3">
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <img
              src={user?.avatar || `https://github.com/${username}.png`}
              className="h-12 w-12 rounded-full"
              alt=""
            />
            <span className="absolute -right-0.5 -bottom-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-tw-surface">
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: sevColor }}
              />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Link
                to="/users/$username"
                params={{ username }}
                className="text-[15px] leading-5 font-medium text-tw-text-primary transition-colors hover:text-tw-accent"
              >
                @{username}
              </Link>
              {user?.location && (
                <>
                  <span className="text-[11px] text-tw-text-tertiary">·</span>
                  <span className="text-[12px] text-tw-text-tertiary">
                    {user.location}
                  </span>
                </>
              )}
            </div>
            <div className="mt-0.5 truncate text-[12px] leading-[18px] text-tw-text-tertiary">
              {isLoading ? (
                "Loading profile..."
              ) : user ? (
                <>
                  Joined {user.accountAge} ago · {user.publicReposFormatted}{" "}
                  public repos
                </>
              ) : (
                "Could not load profile"
              )}
            </div>
          </div>
          <a
            href={`https://github.com/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 rounded-md px-2 py-1 text-[12px] text-tw-text-secondary transition-colors hover:bg-tw-inner hover:text-tw-text-primary"
          >
            View profile →
          </a>
        </div>

        {score && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <ContributorScoreBadge total={score.total} />
              <span className="text-[12px] text-tw-text-tertiary">
                Trust score
              </span>
            </div>
            <ContributorScoreBar score={score} />
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
          </div>
        ) : user ? (
          <ContributorStats user={user} />
        ) : (
          <div className="py-4 text-center text-[13px] text-tw-text-tertiary">
            Could not load GitHub profile data
          </div>
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
    {
      label: "Account age",
      value: user.accountAge,
      bad: user.accountAge.includes("day") || user.accountAge.includes("month"),
    },
    {
      label: "Public repos",
      value: user.publicReposFormatted,
      bad: user.publicRepos < 3,
    },
    {
      label: "Followers",
      value: user.followersFormatted,
      bad: user.followers < 5,
    },
    {
      label: "Total stars",
      value: user.totalStarsFormatted,
      bad: user.totalStars < 10,
    },
    {
      label: "Profile README",
      value: user.hasReadme ? "Yes" : "No",
      bad: !user.hasReadme,
    },
  ]
  return (
    <div className="grid grid-cols-2 gap-x-6">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className={`flex items-center justify-between py-2 ${index < stats.length - 1 ? "border-b border-tw-border" : ""}`}
        >
          <span className="text-[12px] text-tw-text-tertiary">
            {stat.label}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-tw-text-primary tabular-nums">
            {stat.value}
            {stat.bad && (
              <span className="h-1.5 w-1.5 rounded-full bg-tw-error" />
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function Block({
  label,
  note,
  children,
}: {
  label: string
  note?: string
  children: React.ReactNode
}) {
  return (
    <section className="relative flex w-full flex-col gap-[3px] overflow-hidden rounded-xl bg-tw-card p-1">
      <div className="flex items-baseline justify-between gap-4 px-2 pt-1.5 pb-0.5">
        <span className="shrink-0 text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
          {label}
        </span>
        {note && (
          <span className="truncate text-right text-[11px] text-tw-text-tertiary">
            {note}
          </span>
        )}
      </div>
      {children}
    </section>
  )
}

function OutlineCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-[10px]"
      style={{ outline: "2px solid #6E6E6E", outlineOffset: "2px" }}
    >
      <div className="rounded-[10px] bg-tw-inner p-2">{children}</div>
    </div>
  )
}

function ActionPill({
  children,
  variant = "default",
  onClick,
  disabled = false,
}: {
  children: React.ReactNode
  variant?: "primary" | "default" | "ghost"
  onClick?: () => void
  disabled?: boolean
}) {
  const base =
    "flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[13px] leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
  const variants: Record<typeof variant, string> = {
    primary: `${base} bg-tw-text-primary text-tw-bg hover:bg-white`,
    ghost: `${base} text-tw-text-secondary hover:bg-tw-card hover:text-tw-text-primary`,
    default: `${base} bg-tw-card text-tw-text-primary hover:bg-tw-hover`,
  }
  return (
    <Button
      variant="ghost"
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={variants[variant]}
    >
      {children}
    </Button>
  )
}

function SeverityPill({ severity }: { severity: string }) {
  const conf: Record<string, { color: string; label: string }> = {
    error: { color: "#F56D5D", label: "High severity" },
    warning: { color: "#D1BC00", label: "Medium severity" },
    success: { color: "#67E19F", label: "Allowed" },
    info: { color: "#9F9FA9", label: "Info" },
  }
  const severityConfig = conf[severity] || conf.info
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-tw-card px-2 py-1 text-[11px] font-medium text-tw-text-primary">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: severityConfig.color }}
      />
      {severityConfig.label}
    </span>
  )
}

function StatusChip({ status }: { status: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-tw-card px-2 py-0.5 text-[11px] font-medium text-tw-text-secondary capitalize">
      {status}
    </span>
  )
}

function RuleTraceRow({
  label,
  result,
  detail,
}: {
  label: string
  result: "blocked" | "flagged" | "passed" | "skipped"
  detail: string
}) {
  const resultColors: Record<string, string> = {
    blocked: "#F56D5D",
    flagged: "#D1BC00",
    passed: "#67E19F",
    skipped: "#6E6E6E",
  }
  return (
    <div className="flex items-center gap-3 rounded-[10px] bg-tw-inner px-3 py-2.5">
      <EventRuleResultGlyph result={result} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px] leading-5 text-tw-text-primary">
          {label}
        </div>
        <div className="truncate text-[12px] leading-[18px] text-tw-text-tertiary">
          {detail}
        </div>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-tw-card px-2 py-1 text-[11px] font-medium text-tw-text-secondary">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: resultColors[result] }}
        />
        {result.charAt(0).toUpperCase() + result.slice(1)}
      </span>
    </div>
  )
}

function TimelineRow({
  time,
  kind,
  label,
  detail,
}: {
  time: string
  kind: string
  label: string
  detail: string
}) {
  const kindColors: Record<string, string> = {
    opened: "#9F9FA9",
    pipeline: "#34A6FF",
    block: "#F56D5D",
    flag: "#D1BC00",
    action: "#67E19F",
    notify: "#B4B4B4",
  }
  const accent = kindColors[kind] || "#9F9FA9"

  return (
    <div className="flex items-start gap-2.5 rounded-[10px] bg-tw-inner p-2">
      <div
        className="mt-1 h-[10px] w-[10px] shrink-0 rounded-full"
        style={{ backgroundColor: accent }}
      />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-5 text-tw-text-primary">
          {label}
        </div>
        <div className="text-[11px] text-tw-text-tertiary">{detail}</div>
      </div>
      <span className="font-mono text-[11px] whitespace-nowrap text-tw-text-tertiary">
        {time}
      </span>
    </div>
  )
}

const ACTIONED_ACTIONS = new Set([
  "pipeline_blocked",
  "pipeline_warned",
  "pipeline_logged",
  "pr_closed",
  "issue_closed",
  "issue_deleted",
  "comment_deleted",
  "blacklist_blocked",
])

function isAlreadyActioned(action: string | undefined): boolean {
  return action ? ACTIONED_ACTIONS.has(action) : false
}

function getActionedLabel(
  action: string | undefined,
  severity?: string | null
): string {
  // Legacy events emitted pipeline_blocked for warn/log outcomes too;
  // fall back to severity so historical rows render the right verb.
  if (action === "pipeline_blocked") {
    if (severity === "warning") return "flagged this content"
    if (severity === "info") return "logged this content"
    return "blocked this content"
  }
  const labels: Record<string, string> = {
    pipeline_warned: "flagged this content",
    pipeline_logged: "logged this content",
    pr_closed: "closed this PR",
    issue_closed: "closed this issue",
    issue_deleted: "deleted this issue",
    comment_deleted: "deleted this comment",
    blacklist_blocked: "blocked this user",
  }
  return labels[action || ""] || "took action"
}

function getEventTitle(
  action: string,
  severity: string | null | undefined
): string {
  const titles: Record<string, string> = {
    pipeline_blocked: "Content blocked",
    pipeline_allowed: "Content allowed",
    rule_near_miss: "Near miss warning",
    blacklist_blocked: "Blacklisted user blocked",
    whitelist_bypass: "Whitelist bypass",
    bot_bypass: "Bot bypass",
    pr_closed: "Pull request closed",
    issue_closed: "Issue closed",
    comment_deleted: "Comment deleted",
  }
  let title = titles[action] || "Flagged activity"
  if (severity === "error") title = `Blocked — ${title.toLowerCase()}`
  if (severity === "warning" && action !== "rule_near_miss")
    title = `Suspected spam`
  return title
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

function getScoreColor(total: number): string {
  if (total >= 70) return "#67E19F"
  if (total >= 40) return "#D1BC00"
  return "#F56D5D"
}

function ContributorScoreBadge({ total }: { total: number }) {
  const color = getScoreColor(total)
  return (
    <span
      className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {total}/100
    </span>
  )
}

function ContributorScoreBar({
  score,
}: {
  score: {
    total: number
    globalReputation: number
    communitySignals: number
    repoHistory: number
    redFlags: number
  }
}) {
  const segments = [
    {
      label: "Global",
      value: score.globalReputation,
      max: 40,
      color: "#34A6FF",
    },
    {
      label: "Community",
      value: score.communitySignals,
      max: 30,
      color: "#A78BFA",
    },
    { label: "History", value: score.repoHistory, max: 20, color: "#67E19F" },
  ]
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex h-1.5 gap-[1px] overflow-hidden rounded-full bg-tw-surface">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full rounded-full transition-all"
            style={{
              width: `${(s.value / 100) * 100}%`,
              backgroundColor: s.color,
              minWidth: s.value > 0 ? "2px" : "0",
            }}
          />
        ))}
        {score.redFlags < 0 && (
          <div
            className="h-full rounded-full"
            style={{
              width: `${(Math.abs(score.redFlags) / 100) * 100}%`,
              backgroundColor: "#F56D5D",
              minWidth: "2px",
            }}
          />
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-tw-text-tertiary">
        {segments.map((s) => (
          <span key={s.label} className="flex items-center gap-1">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            {s.label} {s.value}
          </span>
        ))}
        {score.redFlags < 0 && (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-tw-error" />
            Flags {score.redFlags}
          </span>
        )}
      </div>
    </div>
  )
}
