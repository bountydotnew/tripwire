/**
 * User/profile data queries — REST search, GraphQL, and HTML scraping.
 */

import { githubApi } from "./app"

/** Get a user's public profile */
export async function getUser(token: string, username: string) {
  return githubApi(`/users/${username}`, token)
}

/** Search a user's merged PRs count */
export async function getMergedPrCount(
  token: string,
  username: string
): Promise<number> {
  const result = await githubApi(
    `/search/issues?q=author:${username}+type:pr+is:merged&per_page=1`,
    token
  )
  return result.total_count
}

/** Search a user's closed PR count (merged + closed without merge) */
export async function getClosedPrCount(
  token: string,
  username: string
): Promise<number> {
  const result = await githubApi(
    `/search/issues?q=author:${username}+type:pr+is:closed&per_page=1`,
    token
  )
  return result.total_count
}

/** Public non-fork repos owned by user (repository search) */
export async function getPublicNonForkRepoCount(
  token: string,
  username: string
): Promise<number> {
  const q = encodeURIComponent(`user:${username} fork:false is:public`)
  const result = await githubApi(
    `/search/repositories?q=${q}&per_page=1`,
    token
  )
  return (result as { total_count: number }).total_count
}

/** Public fork repos owned by user (repository search) */
export async function getPublicForkRepoCount(
  token: string,
  username: string
): Promise<number> {
  const q = encodeURIComponent(`user:${username} fork:true is:public`)
  const result = await githubApi(
    `/search/repositories?q=${q}&per_page=1`,
    token
  )
  return (result as { total_count: number }).total_count
}

/** All PRs (open + closed) authored by user on a specific repo */
export async function getContextRepoPrCount(
  token: string,
  username: string,
  repoFullName: string
): Promise<number> {
  const q = encodeURIComponent(
    `author:${username} type:pr repo:${repoFullName}`
  )
  const result = await githubApi(`/search/issues?q=${q}&per_page=1`, token)
  return (result as { total_count: number }).total_count
}

/** Count PRs opened by a user today in a specific repo */
export async function countUserPrsToday(
  token: string,
  username: string,
  repoFullName: string
): Promise<number> {
  const today = new Date().toISOString().split("T")[0] // YYYY-MM-DD
  const result = await githubApi(
    `/search/issues?q=author:${username}+type:pr+repo:${repoFullName}+created:>=${today}&per_page=1`,
    token
  )
  return result.total_count
}

/** Get the number of files changed in a PR */
export async function getPrFilesCount(
  token: string,
  owner: string,
  repo: string,
  prNumber: number
): Promise<number> {
  const pr = await githubApi(`/repos/${owner}/${repo}/pulls/${prNumber}`, token)
  return pr.changed_files
}

/** Get a user's public repo count */
export async function getUserPublicRepoCount(
  token: string,
  username: string
): Promise<number> {
  const user = await githubApi(`/users/${username}`, token)
  return user.public_repos
}

/** Get repo contributors (users with commits) */
export async function getRepoContributors(
  token: string,
  repoFullName: string
): Promise<Array<{ login: string; avatarUrl: string; contributions: number }>> {
  try {
    const result = await githubApi(
      `/repos/${repoFullName}/contributors?per_page=50`,
      token
    )
    if (!Array.isArray(result)) return []
    const BOT_LOGINS = new Set([
      "dependabot",
      "renovate",
      "github-actions",
      "codecov",
      "netlify",
      "vercel",
      "snyk-bot",
      "greenkeeper",
      "imgbot",
      "allcontributors",
    ])
    return result
      .filter(
        (c: Record<string, unknown>) =>
          c.type === "User" &&
          c.contributions &&
          typeof c.login === "string" &&
          !c.login.endsWith("[bot]") &&
          !BOT_LOGINS.has(c.login.toLowerCase())
      )
      .map((c: Record<string, unknown>) => ({
        login: c.login as string,
        avatarUrl: (c.avatar_url as string) ?? "",
        contributions: c.contributions as number,
      }))
  } catch {
    return []
  }
}

/** Check if user has a profile README (username/username repo with README) */
export async function hasProfileReadme(
  token: string,
  username: string
): Promise<boolean> {
  try {
    await githubApi(`/repos/${username}/${username}/readme`, token)
    return true
  } catch {
    return false
  }
}

/** Enriched user data from GraphQL API */
export interface GitHubUserGraphQL {
  hasSponsorsListing: boolean
  isBountyHunter: boolean
  isCampusExpert: boolean
  isDeveloperProgramMember: boolean
  isGitHubStar: boolean
  isHireable: boolean
  isSiteAdmin: boolean
  sponsoringCount: number
  sponsorsCount: number
  contributionYears: number[]
  contributionsLastYear: number
  organizations: Array<{ login: string; avatarUrl: string }>
  socialAccounts: Array<{ provider: string; url: string }>
  topRepositories: Array<{
    name: string
    stars: number
    language: string | null
  }>
}

/** Fetch enriched user data via GitHub GraphQL API */
export async function fetchUserGraphQL(
  token: string,
  username: string
): Promise<GitHubUserGraphQL | null> {
  const query = `query($login: String!) {
		user(login: $login) {
			hasSponsorsListing
			isBountyHunter
			isCampusExpert
			isDeveloperProgramMember
			isGitHubStar
			isHireable
			isSiteAdmin
			sponsoring(first: 0) { totalCount }
			sponsors(first: 0) { totalCount }
			contributionsCollection {
				contributionCalendar { totalContributions }
				contributionYears
			}
			organizations(first: 10) {
				nodes { login avatarUrl }
			}
			socialAccounts(first: 10) {
				nodes { provider url }
			}
			topRepositories(first: 5, orderBy: { field: STARGAZERS, direction: DESC }) {
				nodes { name stargazerCount primaryLanguage { name } }
			}
		}
	}`

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: username } }),
    })

    if (!res.ok) return null
    const json = await res.json()
    const u = json.data?.user
    if (!u) return null

    return {
      hasSponsorsListing: u.hasSponsorsListing ?? false,
      isBountyHunter: u.isBountyHunter ?? false,
      isCampusExpert: u.isCampusExpert ?? false,
      isDeveloperProgramMember: u.isDeveloperProgramMember ?? false,
      isGitHubStar: u.isGitHubStar ?? false,
      isHireable: u.isHireable ?? false,
      isSiteAdmin: u.isSiteAdmin ?? false,
      sponsoringCount: u.sponsoring?.totalCount ?? 0,
      sponsorsCount: u.sponsors?.totalCount ?? 0,
      contributionYears: u.contributionsCollection?.contributionYears ?? [],
      contributionsLastYear:
        u.contributionsCollection?.contributionCalendar?.totalContributions ??
        0,
      organizations: (u.organizations?.nodes ?? []).map(
        (o: { login: string; avatarUrl: string }) => ({
          login: o.login,
          avatarUrl: o.avatarUrl,
        })
      ),
      socialAccounts: (u.socialAccounts?.nodes ?? []).map(
        (s: { provider: string; url: string }) => ({
          provider: s.provider,
          url: s.url,
        })
      ),
      topRepositories: (u.topRepositories?.nodes ?? []).map(
        (r: {
          name: string
          stargazerCount: number
          primaryLanguage?: { name: string } | null
        }) => ({
          name: r.name,
          stars: r.stargazerCount ?? 0,
          language: r.primaryLanguage?.name ?? null,
        })
      ),
    }
  } catch {
    return null
  }
}

/** Achievement from GitHub profile */
export interface GitHubAchievement {
  type: string
  tier: number
}

/** Fetch user achievements by scraping GitHub profile HTML */
export async function fetchUserAchievements(
  username: string
): Promise<GitHubAchievement[]> {
  try {
    const res = await fetch(`https://github.com/${username}?tab=achievements`, {
      headers: { "User-Agent": "Tripwire" },
    })
    if (!res.ok) return []

    const html = await res.text()
    const { parseHTML } = await import("linkedom")
    const { document } = parseHTML(html)

    const cards = document.querySelectorAll(".js-achievement-card-details")
    const achievements: GitHubAchievement[] = []

    for (const card of cards) {
      const type = (
        card as unknown as { dataset?: { achievementSlug?: string } }
      ).dataset?.achievementSlug
      if (!type) continue
      const tierLabel = card
        .querySelector(".achievement-tier-label")
        ?.textContent?.trim()
      const tier = tierLabel
        ? Number.parseInt(tierLabel.replace("x", ""), 10) || 1
        : 1
      achievements.push({ type, tier })
    }

    return achievements.sort((a, b) => b.tier - a.tier)
  } catch {
    return []
  }
}

/** Contribution day data */
export interface ContributionDay {
  date: string
  count: number
}

export interface ContributionWeek {
  days: ContributionDay[]
}

export interface ContributionsData {
  totalContributions: number
  weeks: ContributionWeek[]
}

export interface PinnedRepo {
  id: string
  name: string
  description: string | null
  url: string
  stars: number
  forks: number
  primaryLanguage: { name: string; color: string | null } | null
}

/** Fetch contribution calendar + pinned repos via GraphQL */
export async function fetchUserContributions(
  token: string,
  username: string
): Promise<{ contributions: ContributionsData; pinned: PinnedRepo[] } | null> {
  const query = `query($login: String!) {
		user(login: $login) {
			contributionsCollection {
				contributionCalendar {
					totalContributions
					weeks {
						contributionDays {
							date
							contributionCount
						}
					}
				}
			}
			pinnedItems(first: 6, types: REPOSITORY) {
				nodes {
					... on Repository {
						id
						name
						description
						url
						stargazerCount
						forkCount
						primaryLanguage { name color }
					}
				}
			}
		}
	}`

  try {
    const res = await fetch("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { login: username } }),
    })

    if (!res.ok) return null
    const json = await res.json()
    const u = json.data?.user
    if (!u) return null

    const cal = u.contributionsCollection?.contributionCalendar
    const contributions: ContributionsData = {
      totalContributions: cal?.totalContributions ?? 0,
      weeks: (cal?.weeks ?? []).map(
        (w: {
          contributionDays: Array<{ date: string; contributionCount: number }>
        }) => ({
          days: w.contributionDays.map((d) => ({
            date: d.date,
            count: d.contributionCount,
          })),
        })
      ),
    }

    const pinned: PinnedRepo[] = (u.pinnedItems?.nodes ?? [])
      .filter((n: Record<string, unknown>) => n && n.name)
      .map((n: Record<string, unknown>) => ({
        id: n.id as string,
        name: n.name as string,
        description: (n.description as string) ?? null,
        url: n.url as string,
        stars: (n.stargazerCount as number) ?? 0,
        forks: (n.forkCount as number) ?? 0,
        primaryLanguage: n.primaryLanguage as {
          name: string
          color: string | null
        } | null,
      }))

    return { contributions, pinned }
  } catch {
    return null
  }
}
