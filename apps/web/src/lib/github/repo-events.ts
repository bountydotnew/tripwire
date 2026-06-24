/**
 * Normalization for the Visibility activity feed. The feed merges two
 * sources into one shape: Tripwire's own `events` table (security
 * outcomes, list/config changes) and raw GitHub repo activity pulled
 * from the GitHub Events API. Both collapse into `FeedEvent` so the UI
 * renders a single chronological stream.
 *
 * This module is pure data — no DB, no React — so it's safe to import on
 * either side of the server/client boundary.
 */

import type { EventFeedIcon } from "#/lib/events-design"

export type FeedEventSeverity = "info" | "warning" | "success" | "error"

export type FeedEventActor = {
  username: string
  avatarUrl: string | null
}

/**
 * Unified feed row. `source` distinguishes a Tripwire DB event (which
 * deep-links to the event detail page via `eventId`) from a raw GitHub
 * event (which links out to GitHub via `url`).
 */
export interface FeedEvent {
  id: string
  source: "tripwire" | "github"
  timestamp: string
  icon: EventFeedIcon
  title: string
  body: string | null
  actor: FeedEventActor | null
  severity: FeedEventSeverity
  githubRef: string | null
  /** Tripwire event UUID — links to `/events/$eventId`. */
  eventId: string | null
  /** External GitHub URL for raw GitHub events. */
  url: string | null
  /**
   * Present only on `PushEvent` rows. Lets the feed collapse consecutive
   * pushes to the same branch by the same actor into a single row.
   */
  push?: {
    branch: string
    commits: number
    /** SHA of the latest commit in this push (HEAD after the push). */
    head: string | null
    /** SHA the branch pointed at before this push (for compare links). */
    before: string | null
  }
}

/** The feed buckets the UI can filter to. */
export type FeedCategory = "all" | "security" | "activity"

/** Tripwire actions that represent a security intervention. */
export const SECURITY_ACTIONS = [
  "pipeline_blocked",
  "pipeline_warned",
  "blacklist_blocked",
  "rule_near_miss",
  "pr_closed",
  "issue_closed",
  "issue_deleted",
  "comment_deleted",
] as const

/** Tripwire actions that represent routine, non-blocking activity. */
export const ACTIVITY_ACTIONS = [
  "github_pr_opened",
  "github_pr_reopened",
  "github_pr_closed",
  "github_pr_merged",
  "github_pr_synchronized",
  "github_issue_opened",
  "github_issue_reopened",
  "github_issue_closed",
  "github_comment_created",
  "github_push",
  "github_release_published",
  "pipeline_allowed",
  "pipeline_logged",
  "whitelist_bypass",
  "whitelist_added",
  "whitelist_removed",
  "blacklist_added",
  "blacklist_removed",
  "rule_config_updated",
  "workflow_run",
] as const

export const TRIPWIRE_ACTION_ICONS: Record<string, EventFeedIcon> = {
  pipeline_blocked: "blocked",
  blacklist_blocked: "blocked",
  pr_closed: "blocked",
  issue_closed: "blocked",
  issue_deleted: "blocked",
  comment_deleted: "blocked",
  pipeline_warned: "warned",
  rule_near_miss: "near_miss",
  pipeline_allowed: "allowed",
  pipeline_logged: "allowed",
  whitelist_bypass: "bypass",
  whitelist_added: "list_add",
  blacklist_added: "list_add",
  whitelist_removed: "list_remove",
  blacklist_removed: "list_remove",
  rule_config_updated: "config",
  workflow_run: "workflow",
  github_pr_opened: "pr",
  github_pr_reopened: "pr",
  github_pr_closed: "pr",
  github_pr_merged: "pr",
  github_pr_synchronized: "pr",
  github_issue_opened: "issue",
  github_issue_reopened: "issue",
  github_issue_closed: "issue",
  github_comment_created: "comment",
  github_push: "push",
  github_release_published: "release",
}

export const TRIPWIRE_ACTION_SEVERITY: Record<string, FeedEventSeverity> = {
  pipeline_blocked: "error",
  blacklist_blocked: "error",
  pr_closed: "error",
  issue_closed: "error",
  issue_deleted: "error",
  comment_deleted: "error",
  pipeline_warned: "warning",
  rule_near_miss: "warning",
  pipeline_allowed: "success",
}

export const TRIPWIRE_ACTION_TITLES: Record<string, string> = {
  pipeline_blocked: "Blocked",
  blacklist_blocked: "Blacklisted user blocked",
  pipeline_warned: "Warned",
  rule_near_miss: "Near miss",
  pipeline_allowed: "Allowed",
  pipeline_logged: "Logged",
  whitelist_bypass: "Whitelist bypass",
  pr_closed: "PR closed",
  issue_closed: "Issue closed",
  issue_deleted: "Issue removed",
  comment_deleted: "Comment deleted",
  whitelist_added: "Whitelisted",
  whitelist_removed: "Removed from whitelist",
  blacklist_added: "Blacklisted",
  blacklist_removed: "Removed from blacklist",
  rule_config_updated: "Rule updated",
  workflow_run: "Workflow run",
  github_pr_opened: "PR opened",
  github_pr_reopened: "PR reopened",
  github_pr_closed: "PR closed",
  github_pr_merged: "PR merged",
  github_pr_synchronized: "PR updated",
  github_issue_opened: "Issue opened",
  github_issue_reopened: "Issue reopened",
  github_issue_closed: "Issue closed",
  github_comment_created: "Commented",
  github_push: "Pushed",
  github_release_published: "Released",
}

/** Map a Tripwire `EventAction` to its feed icon bucket. */
export function tripwireIcon(action: string): EventFeedIcon {
  return TRIPWIRE_ACTION_ICONS[action] ?? "generic"
}

/** Map a Tripwire `EventAction` to its feed title. */
export function feedTitleForAction(action: string): string {
  return TRIPWIRE_ACTION_TITLES[action] ?? action
}

/** Raw shape of one entry from `GET /repos/{owner}/{repo}/events`. */
export interface RawGitHubEvent {
  id: string
  type: string | null
  created_at: string
  actor?: {
    login?: string
    avatar_url?: string
    display_login?: string
  }
  repo?: { name?: string }
  payload?: Record<string, unknown>
}

function refToShortSha(ref: unknown): string | null {
  if (typeof ref !== "string") return null
  return ref.replace(/^refs\/heads\//, "").replace(/^refs\/tags\//, "")
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null
}

function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`
}

/**
 * Direct link for a push: the single commit when there's one, otherwise a
 * compare view spanning the push. Falls back to the repo base when the
 * payload lacks SHAs.
 */
function pushUrl(
  ghBase: string,
  size: number,
  head: string | null,
  before: string | null
): string {
  if (head && (size <= 1 || !before)) return `${ghBase}/commit/${head}`
  if (head && before) return `${ghBase}/compare/${before}...${head}`
  return ghBase
}

/**
 * Turn one raw GitHub event into a `FeedEvent`. Returns `null` for event
 * types we don't surface (e.g. bot-noise types) so callers can filter.
 */
export function formatGitHubEvent(
  event: RawGitHubEvent,
  repoFullName: string
): FeedEvent | null {
  const payload = event.payload ?? {}
  const actorLogin = event.actor?.login ?? null
  const actor: FeedEventActor | null = actorLogin
    ? {
        username: actorLogin,
        avatarUrl: event.actor?.avatar_url ?? null,
      }
    : null

  const base = {
    id: `gh-${event.id}`,
    source: "github" as const,
    timestamp: event.created_at,
    actor,
    severity: "info" as FeedEventSeverity,
    eventId: null,
  }

  const ghBase = `https://github.com/${repoFullName}`

  switch (event.type) {
    case "PushEvent": {
      const branch = refToShortSha(payload.ref) ?? "a branch"
      const size = typeof payload.size === "number" ? payload.size : 1
      const head = typeof payload.head === "string" ? payload.head : null
      const before = typeof payload.before === "string" ? payload.before : null
      return {
        ...base,
        icon: "push",
        title: "Pushed",
        body: `${pluralize(size, "commit")} to ${branch}`,
        githubRef: head ? head.slice(0, 7) : null,
        url: pushUrl(ghBase, size, head, before),
        push: { branch, commits: size, head, before },
      }
    }
    case "PullRequestEvent": {
      const pr = asRecord(payload.pull_request)
      const action = typeof payload.action === "string" ? payload.action : ""
      const number = pr?.number
      const merged = pr?.merged === true
      const verb = merged && action === "closed" ? "merged" : action
      return {
        ...base,
        icon: "pr",
        title: `PR ${verb || "updated"}`,
        body: typeof pr?.title === "string" ? pr.title : null,
        githubRef: typeof number === "number" ? `#${number}` : null,
        url: typeof number === "number" ? `${ghBase}/pull/${number}` : ghBase,
      }
    }
    case "IssuesEvent": {
      const issue = asRecord(payload.issue)
      const action = typeof payload.action === "string" ? payload.action : ""
      const number = issue?.number
      return {
        ...base,
        icon: "issue",
        title: `Issue ${action || "updated"}`,
        body: typeof issue?.title === "string" ? issue.title : null,
        githubRef: typeof number === "number" ? `#${number}` : null,
        url: typeof number === "number" ? `${ghBase}/issues/${number}` : ghBase,
      }
    }
    case "IssueCommentEvent": {
      const issue = asRecord(payload.issue)
      const number = issue?.number
      return {
        ...base,
        icon: "comment",
        title: "Commented",
        body:
          typeof issue?.title === "string"
            ? `on ${issue.title}`
            : number
              ? `on #${number}`
              : null,
        githubRef: typeof number === "number" ? `#${number}` : null,
        url: typeof number === "number" ? `${ghBase}/issues/${number}` : ghBase,
      }
    }
    case "WatchEvent":
      return {
        ...base,
        icon: "star",
        title: "Starred",
        body: "this repository",
        githubRef: null,
        url: ghBase,
      }
    case "ForkEvent": {
      const forkee = asRecord(payload.forkee)
      const target =
        forkee && typeof forkee.full_name === "string" ? forkee.full_name : null
      return {
        ...base,
        icon: "fork",
        title: "Forked",
        body: target ? `to ${target}` : "this repository",
        githubRef: null,
        url: target ? `https://github.com/${target}` : ghBase,
      }
    }
    case "ReleaseEvent": {
      const release = asRecord(payload.release)
      const name =
        (typeof release?.name === "string" && release.name) ||
        (typeof release?.tag_name === "string" && release.tag_name) ||
        null
      return {
        ...base,
        icon: "release",
        title: "Released",
        body: name,
        githubRef: null,
        url:
          typeof release?.html_url === "string"
            ? release.html_url
            : `${ghBase}/releases`,
      }
    }
    case "CreateEvent": {
      const refType =
        typeof payload.ref_type === "string" ? payload.ref_type : "ref"
      const ref = refToShortSha(payload.ref)
      return {
        ...base,
        icon: "branch",
        title: `Created ${refType}`,
        body: ref,
        githubRef: null,
        url: ghBase,
      }
    }
    case "DeleteEvent": {
      const refType =
        typeof payload.ref_type === "string" ? payload.ref_type : "ref"
      const ref = refToShortSha(payload.ref)
      return {
        ...base,
        icon: "branch",
        title: `Deleted ${refType}`,
        body: ref,
        githubRef: null,
        url: ghBase,
      }
    }
    default:
      // Unsupported / noisy event type — skip it.
      return null
  }
}

/** Strip a `/commit/...` or `/compare/...` suffix back to the repo base. */
function ghBaseFromUrl(url: string | null): string {
  if (!url) return ""
  return url.replace(/\/(commit|compare)\/.*$/, "")
}

/**
 * Collapse runs of consecutive push events by the same actor to the same
 * branch into a single row ("Pushed 6 commits to dev"). Expects events in
 * reverse-chronological order; the merged row keeps the most recent
 * timestamp and identity. Non-push events pass through untouched.
 */
export function collapsePushEvents(events: FeedEvent[]): FeedEvent[] {
  const result: FeedEvent[] = []

  for (const event of events) {
    const prev = result[result.length - 1]
    const sameRun =
      prev?.push &&
      event.push &&
      prev.push.branch === event.push.branch &&
      Boolean(prev.actor?.username) &&
      Boolean(event.actor?.username) &&
      prev.actor?.username === event.actor?.username

    if (sameRun && prev?.push && event.push) {
      const commits = prev.push.commits + event.push.commits
      // Events are reverse-chronological: `prev` is the newer push (final
      // HEAD), `event` is the older one (earlier starting point). Span the
      // whole run with a compare from the oldest `before` to the newest head.
      const head = prev.push.head
      const before = event.push.before ?? prev.push.before
      result[result.length - 1] = {
        ...prev,
        body: `${commits} commit${commits === 1 ? "" : "s"} to ${prev.push.branch}`,
        url:
          head && before
            ? `${ghBaseFromUrl(prev.url)}/compare/${before}...${head}`
            : prev.url,
        push: { branch: prev.push.branch, commits, head, before },
      }
      continue
    }

    result.push(event)
  }

  return result
}
