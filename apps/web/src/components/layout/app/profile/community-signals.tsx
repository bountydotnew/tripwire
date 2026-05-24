import type { GitHubUserGraphQL, GitHubAchievement } from "@tripwire/github"
import { getBadgeInfo } from "#/lib/github/badges"

function AchievementBadge({ achievement }: { achievement: GitHubAchievement }) {
  const info = getBadgeInfo(achievement.type, achievement.tier)
  return (
    <div
      className="group flex flex-col items-center gap-1"
      title={`${info.label}${info.tierLabel ? ` (${info.tierLabel})` : ""} — ${info.description}`}
    >
      <div className="relative">
        <img
          src={info.imageUrl}
          alt={info.label}
          className="h-12 w-12 drop-shadow-sm"
        />
      </div>
      <span className="text-center text-[10px] leading-tight text-tw-text-tertiary transition-colors group-hover:text-tw-text-secondary">
        {info.label}
      </span>
    </div>
  )
}

function StatPill({
  label,
  value,
  href,
}: {
  label: string
  value: number
  href?: string
}) {
  const inner = (
    <span className="inline-flex items-center gap-1.5 text-[12px]">
      <span className="font-medium text-tw-text-primary tabular-nums">
        {value.toLocaleString()}
      </span>
      <span className="text-tw-text-tertiary">{label}</span>
    </span>
  )
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="transition-opacity hover:opacity-80"
      >
        {inner}
      </a>
    )
  }
  return inner
}

export function CommunitySignals({
  graphql,
  achievements,
  username,
}: {
  graphql: GitHubUserGraphQL | null
  achievements: GitHubAchievement[]
  username: string
}) {
  if (!graphql && achievements.length === 0) return null

  const hasSponsors = (graphql?.sponsorsCount ?? 0) > 0
  const hasSponsoring = (graphql?.sponsoringCount ?? 0) > 0
  const hasOrgs = (graphql?.organizations?.length ?? 0) > 0
  const hasSocials = (graphql?.socialAccounts?.length ?? 0) > 0
  const hasBadges =
    graphql?.isGitHubStar ||
    graphql?.isBountyHunter ||
    graphql?.isDeveloperProgramMember ||
    graphql?.isCampusExpert ||
    graphql?.isSiteAdmin
  const hasAchievements = achievements.length > 0
  const hasStats = hasSponsors || hasSponsoring

  if (!hasBadges && !hasAchievements && !hasOrgs && !hasStats && !hasSocials)
    return null

  return (
    <section className="flex flex-col gap-[3px] rounded-xl bg-tw-card p-1">
      <div className="px-2 pt-1.5 pb-0.5">
        <span className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
          Community
        </span>
      </div>
      <div className="flex flex-col gap-3 rounded-[10px] bg-tw-inner p-3">
        {/* Badges */}
        {hasBadges && (
          <div className="flex flex-wrap items-center gap-1.5">
            {graphql?.isGitHubStar && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-1 text-[11px] text-amber-300">
                GitHub Star
              </span>
            )}
            {graphql?.isSiteAdmin && (
              <span className="inline-flex items-center gap-1 rounded-md bg-tw-accent/10 px-2 py-1 text-[11px] text-tw-accent">
                GitHub Staff
              </span>
            )}
            {graphql?.isBountyHunter && (
              <span className="inline-flex items-center gap-1 rounded-md bg-tw-inner px-2 py-1 text-[11px] text-tw-text-secondary">
                Bug Bounty Hunter
              </span>
            )}
            {graphql?.isDeveloperProgramMember && (
              <span className="inline-flex items-center gap-1 rounded-md bg-tw-inner px-2 py-1 text-[11px] text-tw-text-secondary">
                Developer Program
              </span>
            )}
            {graphql?.isCampusExpert && (
              <span className="inline-flex items-center gap-1 rounded-md bg-tw-inner px-2 py-1 text-[11px] text-tw-text-secondary">
                Campus Expert
              </span>
            )}
          </div>
        )}

        {/* Achievements */}
        {hasAchievements && (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start gap-4">
              {achievements.map((a, i) => (
                <AchievementBadge key={`${a.type}-${i}`} achievement={a} />
              ))}
            </div>
          </div>
        )}

        {/* Sponsors stats */}
        {hasStats && (
          <div className="flex items-center gap-4">
            {hasSponsors && (
              <StatPill
                label={graphql!.sponsorsCount === 1 ? "sponsor" : "sponsors"}
                value={graphql!.sponsorsCount}
                href={`https://github.com/sponsors/${username}`}
              />
            )}
            {hasSponsoring && (
              <StatPill label="sponsoring" value={graphql!.sponsoringCount} />
            )}
            {graphql?.hasSponsorsListing && (
              <a
                href={`https://github.com/sponsors/${username}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-tw-accent hover:underline"
              >
                Sponsor
              </a>
            )}
          </div>
        )}

        {/* Organizations */}
        {hasOrgs && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-tw-text-tertiary">
              Organizations
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {graphql!.organizations.map((org) => (
                <a
                  key={org.login}
                  href={`https://github.com/${org.login}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-md bg-tw-card px-2 py-1 transition-opacity hover:opacity-80"
                >
                  <img
                    src={org.avatarUrl}
                    alt=""
                    className="h-4 w-4 rounded-full"
                  />
                  <span className="text-[11px] text-tw-text-secondary">
                    {org.login}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Social accounts */}
        {hasSocials && (
          <div className="flex flex-wrap items-center gap-3">
            {graphql!.socialAccounts.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary"
              >
                {s.provider === "TWITTER"
                  ? "Twitter"
                  : s.provider === "LINKEDIN"
                    ? "LinkedIn"
                    : s.url
                        .replace(/^https?:\/\/(www\.)?/, "")
                        .replace(/\/$/, "")}
              </a>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
