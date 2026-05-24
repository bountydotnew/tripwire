import { useQuery } from "@tanstack/react-query"
import { fetchPublicProfile } from "@tripwire/github/public"
import { qk } from "#/lib/query-keys"

export interface GitHubUserProfile {
  username: string
  name: string | null
  avatar: string
  location: string | null
  bio: string | null
  company: string | null
  accountAge: string
  publicRepos: number
  followers: number
  following: number
  hasReadme: boolean
  totalStars: number
  url: string
}

function formatAccountAge(createdAt: string): string {
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  const days = Math.floor(diffMs / 86400000)
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""}`
  const months = Math.floor(days / 30)
  if (months < 12) return `${months} month${months !== 1 ? "s" : ""}`
  const years = Math.floor(days / 365)
  const remMonths = Math.floor((days % 365) / 30)
  return remMonths > 0 ? `${years}y ${remMonths}mo` : `${years}y`
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

export function useGitHubUser(username: string | undefined) {
  return useQuery({
    queryKey: qk.github.profile(username ?? ""),
    queryFn: async () => {
      if (!username) throw new Error("Username required")
      const profile = await fetchPublicProfile(username)
      if (!profile) throw new Error(`User @${username} not found`)

      const { user, totalStars, hasReadme } = profile
      return {
        username: user.login,
        name: user.name,
        avatar: user.avatar_url,
        location: user.location,
        bio: user.bio,
        company: user.company,
        accountAge: formatAccountAge(user.created_at),
        publicRepos: user.public_repos,
        followers: user.followers,
        following: user.following,
        hasReadme,
        totalStars,
        url: user.html_url,
      } satisfies GitHubUserProfile
    },
    enabled: !!username,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  })
}

export function useGitHubUserFormatted(username: string | undefined) {
  const query = useGitHubUser(username)

  const formatted = query.data
    ? {
        ...query.data,
        followersFormatted: formatNumber(query.data.followers),
        publicReposFormatted: formatNumber(query.data.publicRepos),
        totalStarsFormatted: formatNumber(query.data.totalStars),
      }
    : null

  return {
    ...query,
    data: formatted,
  }
}
