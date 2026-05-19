import { createFileRoute, Link } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { authClient } from "@tripwire/auth/client"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/lib/workspace-context"
import { useGitHubUserFormatted } from "#/lib/use-github-user"
import { ContributionsHeatmap } from "#/components/profile/contributions-heatmap"
import { PinnedRepos } from "#/components/profile/pinned-repos"
import { GithubIcon } from "#/components/icons/github"
import { CommunitySignals } from "#/components/profile/community-signals"
import { Button } from "#/components/ui/button"
import { buildSeoMeta } from "#/lib/seo"

export const Route = createFileRoute("/_app/users/$username")({
  component: UserProfilePage,
  head: ({ params }) => ({
    meta: buildSeoMeta({
      title: `@${params.username}`,
      description: `GitHub profile and Tripwire contributor score for @${params.username}.`,
      path: `/users/${params.username}`,
      type: "profile",
    }),
  }),
})

function UserProfilePage() {
  const { username } = Route.useParams()
  const { org, repo } = useWorkspace()
  const { data: session } = authClient.useSession()
  const trpc = useTRPC()

  const githubUser = useGitHubUserFormatted(username)
  const user = githubUser.data

  const scoreQuery = useQuery({
    ...trpc.reputation.getScore.queryOptions({
      repoId: repo?.id ?? "",
      username,
    }),
    enabled: !!repo?.id,
  })

  const profileQuery = useQuery({
    ...trpc.reputation.getProfile.queryOptions({
      repoId: repo?.id ?? "",
      username,
    }),
    enabled: !!repo?.id,
  })

  // Only show activity if the session user owns the repo or IS the viewed user
  const isOwner = !!repo?.id // They can see the page because they're authed with repo access
  const isSelf = session?.user?.name?.toLowerCase() === username.toLowerCase()
  const canSeeActivity = isOwner || isSelf

  const eventsQuery = useQuery({
    ...trpc.events.list.queryOptions({
      repoId: repo?.id ?? "",
      targetUsername: username,
      limit: 20,
    }),
    enabled: !!repo?.id && canSeeActivity,
  })

  const scoreData = scoreQuery.data
  const score = scoreData?.score ?? null
  const profile = profileQuery.data
  const events = eventsQuery.data?.events ?? []

  if (githubUser.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-2">
        <p className="text-[14px] text-tw-text-secondary">
          User @{username} not found
        </p>
      </div>
    )
  }

  const scoreTotal = score?.total ?? null
  const scoreColor =
    scoreTotal !== null
      ? scoreTotal >= 70
        ? "#67E19F"
        : scoreTotal >= 40
          ? "#D1BC00"
          : "#F56D5D"
      : "#6E6E6E"

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-10 pb-16">
      {/* Profile header */}
      <div className="flex items-start gap-4">
        <img
          src={user.avatar}
          alt=""
          className="h-16 w-16 shrink-0 rounded-full"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <h1 className="m-0 text-[20px] font-semibold text-tw-text-primary">
              @{user.username}
            </h1>
            {scoreTotal !== null && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] font-medium"
                style={{
                  backgroundColor: `${scoreColor}18`,
                  color: scoreColor,
                }}
              >
                {Math.round(scoreTotal)}
              </span>
            )}
          </div>
          {user.name && (
            <span className="text-[14px] text-tw-text-secondary">
              {user.name}
            </span>
          )}
          <div className="mt-0.5 flex flex-wrap items-center gap-3 text-[12px] text-tw-text-tertiary">
            {user.location && <span>{user.location}</span>}
            {user.company && (
              <>
                {user.location && <span>·</span>}
                <span>{user.company}</span>
              </>
            )}
            <span>Joined {user.accountAge} ago</span>
          </div>
        </div>
        <Button size="sm" variant="outline">
          <Link
            to={user.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2"
          >
            <GithubIcon className="h-4 w-4" />
            View on GitHub
          </Link>
        </Button>
      </div>

      {user.bio && (
        <p className="m-0 -mt-2 text-[13px] leading-relaxed text-tw-text-secondary">
          {user.bio}
        </p>
      )}

      {/* Score breakdown */}
      {score && scoreTotal !== null && (
        <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
          <div className="flex items-baseline justify-between px-2 pt-1.5 pb-0.5">
            <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
              Contributor score
            </span>
            <span
              className="font-mono text-[14px] font-medium"
              style={{ color: scoreColor }}
            >
              {Math.round(scoreTotal)}/100
            </span>
          </div>
          <div className="flex flex-col gap-3 rounded-[10px] bg-tw-inner p-3">
            <div className="flex h-2 gap-0.5 overflow-hidden rounded-full bg-[#ffffff08]">
              {[
                { value: score.globalReputation, color: "#34A6FF" },
                { value: score.communitySignals, color: "#9F7AEA" },
                { value: score.repoHistory, color: "#67E19F" },
              ].map((seg) => (
                <div
                  key={seg.color}
                  className="h-full rounded-full"
                  style={{
                    width: `${(seg.value / 100) * 100}%`,
                    backgroundColor: seg.color,
                    minWidth: seg.value > 0 ? "3px" : "0",
                  }}
                />
              ))}
            </div>
            <div className="flex items-center gap-4 text-[11px] text-tw-text-tertiary">
              <span
                className="flex items-center gap-1.5"
                title="Account age, followers, merged PRs, public repos"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#34A6FF" }}
                />
                Global {score.globalReputation}/40
              </span>
              <span
                className="flex items-center gap-1.5"
                title="Achievements, sponsors, orgs, social accounts, profile completeness"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#9F7AEA" }}
                />
                Community {score.communitySignals}/30
              </span>
              <span
                className="flex items-center gap-1.5"
                title="Tripwire event history — allowed, blocked, near-miss"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: "#67E19F" }}
                />
                Repo {score.repoHistory}/20
              </span>
              {score.redFlags < 0 && (
                <span
                  className="flex items-center gap-1.5"
                  title="Suspicious patterns — high block ratio, new account with no activity"
                >
                  <span className="h-2 w-2 rounded-full bg-tw-error" />
                  Flags {score.redFlags}
                </span>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Contributions heatmap */}
      {profile?.contributions && (
        <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
          <div className="px-2 pt-1.5 pb-0.5">
            <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
              Contributions
            </span>
          </div>
          <div className="overflow-hidden rounded-[10px] bg-tw-inner p-3">
            <ContributionsHeatmap data={profile.contributions} />
          </div>
        </section>
      )}

      {/* Pinned repos */}
      {profile?.pinned && profile.pinned.length > 0 && (
        <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
          <div className="px-2 pt-1.5 pb-0.5">
            <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
              Pinned repositories
            </span>
          </div>
          <div className="p-1">
            <PinnedRepos repos={profile.pinned} />
          </div>
        </section>
      )}

      {/* Community signals */}
      {profile && (
        <CommunitySignals
          graphql={profile.graphql}
          achievements={profile.achievements}
          username={username}
        />
      )}

      {/* Stats grid */}
      <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
        <div className="px-2 pt-1.5 pb-0.5">
          <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
            Profile
          </span>
        </div>
        <div className="rounded-[10px] bg-tw-inner p-3">
          <div className="grid grid-cols-2 gap-x-6">
            {[
              {
                label: "Account age",
                value: user.accountAge,
                bad:
                  user.accountAge.includes("day") ||
                  user.accountAge.includes("month"),
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
              { label: "Following", value: String(user.following ?? 0) },
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
            ].map((stat, i, arr) => (
              <div
                key={stat.label}
                className={`flex items-center justify-between py-2 ${i < arr.length - 2 ? "border-b border-tw-border" : ""}`}
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
        </div>
      </section>

      {/* Activity (restricted to org owners / self) */}
      {canSeeActivity && (
        <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
          <div className="flex items-baseline justify-between px-2 pt-1.5 pb-0.5">
            <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
              Activity on {repo?.name ?? "this repo"}
            </span>
            <span className="text-[11px] text-tw-text-tertiary">
              {events.length} event{events.length !== 1 ? "s" : ""}
            </span>
          </div>
          {eventsQuery.isPending ? (
            <div className="flex items-center justify-center rounded-[10px] bg-tw-inner p-4">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-tw-text-tertiary border-t-tw-accent" />
            </div>
          ) : events.length === 0 ? (
            <div className="rounded-[10px] bg-tw-inner px-3 py-4 text-center text-[13px] text-tw-text-tertiary">
              No Tripwire events for this user yet
            </div>
          ) : (
            <div className="flex flex-col gap-[3px]">
              {events.slice(0, 10).map((event) => {
                const sevColor =
                  event.severity === "error"
                    ? "#F56D5D"
                    : event.severity === "success"
                      ? "#67E19F"
                      : event.severity === "warning"
                        ? "#D1BC00"
                        : "#9F9FA9"
                return (
                  <Link
                    key={event.id}
                    to={
                      org?.slug
                        ? "/$orgHandle/events/$eventId"
                        : ("/" as string)
                    }
                    params={
                      org?.slug
                        ? { orgHandle: org.slug, eventId: event.id }
                        : { orgHandle: "_", eventId: event.id }
                    }
                    className={`flex items-center gap-3 rounded-[10px] bg-tw-inner px-3 py-2.5 ${org?.slug ? "transition-colors hover:bg-tw-hover" : "pointer-events-none"}`}
                  >
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: sevColor }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] text-tw-text-primary">
                        {event.description ?? event.action}
                      </div>
                    </div>
                    {event.githubRef && (
                      <span className="shrink-0 font-mono text-[11px] text-tw-text-tertiary">
                        {event.githubRef}
                      </span>
                    )}
                    <span className="shrink-0 text-[11px] text-tw-text-tertiary">
                      {formatEventTime(event.createdAt)}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function formatEventTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  const hrs = Math.floor(mins / 60)
  const days = Math.floor(hrs / 24)
  if (mins < 1) return "now"
  if (mins < 60) return `${mins}m`
  if (hrs < 24) return `${hrs}h`
  if (days < 7) return `${days}d`
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}
