import type { PinnedRepo } from "@tripwire/github"
import {
  RepoStarIcon12,
  RepoForkNetworkIcon11,
} from "@tripwire/ui/icons/github-repo-meta-icons"

export function PinnedRepoCard({ repo }: { repo: PinnedRepo }) {
  return (
    <a
      href={repo.url}
      target="_blank"
      rel="noreferrer"
      className="flex flex-col justify-between gap-1 rounded-lg bg-tw-inner px-3.5 py-2.5 transition-opacity hover:opacity-80"
    >
      <div>
        <div className="truncate text-[13px] font-medium text-tw-text-primary">
          {repo.name}
        </div>
        {repo.description && (
          <p className="m-0 mt-0.5 line-clamp-2 text-[11px] leading-snug text-tw-text-tertiary">
            {repo.description}
          </p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-tw-text-tertiary">
        {repo.primaryLanguage && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                backgroundColor: repo.primaryLanguage.color ?? "currentColor",
              }}
            />
            {repo.primaryLanguage.name}
          </span>
        )}
        {repo.stars > 0 && (
          <span className="flex items-center gap-0.5">
            <RepoStarIcon12 />
            {repo.stars}
          </span>
        )}
        {repo.forks > 0 && (
          <span className="flex items-center gap-0.5">
            <RepoForkNetworkIcon11 />
            {repo.forks}
          </span>
        )}
      </div>
    </a>
  )
}

export function PinnedRepos({ repos }: { repos: PinnedRepo[] }) {
  if (repos.length === 0) return null
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {repos.map((repo) => (
        <PinnedRepoCard key={repo.id} repo={repo} />
      ))}
    </div>
  )
}
