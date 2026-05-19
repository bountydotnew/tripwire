/**
 * Public GitHub API — no authentication required.
 *
 * These functions use the unauthenticated GitHub REST + GraphQL APIs.
 * Rate limit: 60 requests/hour per IP (vs 5000/hour authenticated).
 * Use for profile pages, user cards, and anywhere a Tripwire
 * installation token isn't available.
 */

export interface PublicGitHubUser {
  login: string
  id: number
  name: string | null
  avatar_url: string
  bio: string | null
  company: string | null
  location: string | null
  blog: string | null
  twitter_username: string | null
  public_repos: number
  public_gists: number
  followers: number
  following: number
  created_at: string
  html_url: string
}

export interface PublicGitHubRepo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  stargazers_count: number
  forks_count: number
  language: string | null
  fork: boolean
}

const GITHUB_API = "https://api.github.com"
const HEADERS = {
  Accept: "application/vnd.github.v3+json",
  "User-Agent": "Tripwire",
}

async function githubPublic<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${GITHUB_API}${path}`, { headers: HEADERS })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

/** Fetch a public GitHub user profile. */
export async function fetchPublicUser(
  username: string
): Promise<PublicGitHubUser | null> {
  return githubPublic(`/users/${username}`)
}

/** Fetch a user's public repos (up to 100, sorted by stars). */
export async function fetchPublicRepos(
  username: string
): Promise<PublicGitHubRepo[]> {
  const repos = await githubPublic<PublicGitHubRepo[]>(
    `/users/${username}/repos?per_page=100&sort=stargazers&direction=desc`
  )
  return repos ?? []
}

/** Check if a user has a profile README (username/username repo). */
export async function hasPublicProfileReadme(
  username: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${GITHUB_API}/repos/${username}/${username}/readme`,
      {
        headers: HEADERS,
      }
    )
    return res.ok
  } catch {
    return false
  }
}

/** Calculate total stars across all of a user's repos. */
export async function fetchTotalStars(username: string): Promise<number> {
  const repos = await fetchPublicRepos(username)
  return repos.reduce((sum, r) => sum + (r.stargazers_count ?? 0), 0)
}

/**
 * Composite profile fetch — gets user + repos + readme check in parallel.
 * This is the main function the `useGitHubUserFormatted` hook should call.
 */
export interface GitHubPublicProfile {
  user: PublicGitHubUser
  totalStars: number
  hasReadme: boolean
  topRepos: PublicGitHubRepo[]
}

export async function fetchPublicProfile(
  username: string
): Promise<GitHubPublicProfile | null> {
  const [user, repos, hasReadme] = await Promise.all([
    fetchPublicUser(username),
    fetchPublicRepos(username),
    hasPublicProfileReadme(username),
  ])

  if (!user) return null

  const totalStars = repos.reduce(
    (sum, r) => sum + (r.stargazers_count ?? 0),
    0
  )
  const topRepos = repos
    .filter((r) => !r.fork)
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 6)

  return { user, totalStars, hasReadme, topRepos }
}
