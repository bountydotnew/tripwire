import { Link } from "@tanstack/react-router"
import { ChevronRightIndicatorIcon12 } from "@tripwire/ui/icons/app-chrome-icons"
import type { FeedEvent } from "#/lib/github/repo-events"

const SEVERITY_DOT: Record<FeedEvent["severity"], string> = {
  success: "bg-tw-success",
  error: "bg-tw-error",
  warning: "bg-tw-warning",
  info: "bg-tw-accent",
}

function timeAgo(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  })
}

function RowBody({ event }: { event: FeedEvent }) {
  return (
    <>
      <span
        className={`size-2 shrink-0 rounded-full ${SEVERITY_DOT[event.severity]}`}
      />

      <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
        <span className="shrink-0 text-[13px] leading-4 font-medium tracking-[-0.2px] text-white">
          {event.title}
        </span>
        {event.body && (
          <span className="min-w-0 flex-1 truncate text-[13px] leading-4 text-[#FFFFFF73]">
            {event.body}
          </span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {event.source === "github" && (
          <span className="rounded bg-white/5 px-1.5 py-0.5 text-[11px] leading-none font-medium text-[#FFFFFF59]">
            GitHub
          </span>
        )}
        {event.githubRef && (
          <span className="font-mono text-[11px] leading-none text-[#FFFFFF73]">
            {event.githubRef}
          </span>
        )}
      </div>

      {event.actor && (
        <div className="flex shrink-0 items-center gap-1.5">
          <img
            src={
              event.actor.avatarUrl ??
              `https://github.com/${event.actor.username}.png?size=32`
            }
            alt=""
            className="size-4 rounded-full"
          />
          <span className="hidden text-[12px] font-medium text-[#FFFFFF73] sm:inline">
            {event.actor.username}
          </span>
        </div>
      )}

      <span className="w-14 shrink-0 text-right text-[12px] text-[#FFFFFF59] tabular-nums">
        {timeAgo(event.timestamp)}
      </span>
    </>
  )
}

export function RepoActivityRow({ event }: { event: FeedEvent }) {
  // Tripwire events deep-link to the audit detail page; GitHub events
  // link out to GitHub. List/config changes have no detail page.
  if (event.source === "tripwire" && event.eventId) {
    return (
      <Link
        to="/events/$eventId"
        params={{ eventId: event.eventId }}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-white/[0.02]"
      >
        <RowBody event={event} />
        <ChevronRightIndicatorIcon12 className="shrink-0 text-[#FFFFFF59]" />
      </Link>
    )
  }

  if (event.source === "github" && event.url) {
    return (
      <a
        href={event.url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 no-underline transition-colors hover:bg-white/[0.02]"
      >
        <RowBody event={event} />
        <ChevronRightIndicatorIcon12 className="shrink-0 text-[#FFFFFF59]" />
      </a>
    )
  }

  return (
    <div className="flex w-full items-center gap-3 px-4 py-2.5">
      <RowBody event={event} />
    </div>
  )
}
