import type { KeyboardEvent, MouseEvent } from "react"
import { Button } from "#/components/ui/button"
import {
  EventAlertTriangleIcon,
  EventCloseCircleSolidIcon,
  EventPauseHourglassIcon,
} from "#/components/icons/event-group-status-icons"
import type { TripwireEvent, User } from "#/types/home"

interface EventGroupCardProps {
  group: {
    key: string
    items: TripwireEvent[]
  }
  onOpenEvent?: (event: TripwireEvent) => void
}

function getUser(username: string): User {
  return {
    username,
    name: username,
    avatar: `https://github.com/${username}.png`,
    accountAge: "Unknown",
    publicRepos: 0,
    followers: 0,
    mergedPrs: 0,
    readme: false,
    tint: "#888",
  }
}

export function EventGroupCard({ group, onOpenEvent }: EventGroupCardProps) {
  const first = group.items[0]
  const users = group.items.flatMap((e) => e.users)

  const handleAction = (ev: MouseEvent | KeyboardEvent) => {
    ev.stopPropagation()
    onOpenEvent?.(first)
  }

  const handleActionKeyDown = (ev: KeyboardEvent<HTMLSpanElement>) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault()
      handleAction(ev)
    }
  }

  return (
    <div className="relative flex w-full flex-col gap-[3px] overflow-hidden rounded-xl bg-tw-card p-1">
      <Button
        variant="ghost"
        onClick={() => onOpenEvent?.(first)}
        type="button"
        className="group cursor-pointer rounded-[10px] text-left focus:outline-none"
      >
        <div className="flex flex-col gap-1 rounded-[10px] bg-tw-inner p-2 transition-colors group-hover:bg-[#FAFAFA26]">
          {users.length === 1 && first.preview ? (
            <SingleUserPreview
              user={getUser(users[0])}
              preview={first.preview}
            />
          ) : (
            <MultiUserRow userKeys={users} />
          )}
        </div>
      </Button>

      <div className="rounded-xl">
        <div className="flex items-center justify-between gap-3 p-1">
          <div className="relative flex min-w-0 items-center gap-2 px-1.5">
            <EventAlertTriangleIcon
              color={
                first.severity === "warning"
                  ? "#D1BC00"
                  : first.severity === "success"
                    ? "#67E19F"
                    : "#F56D5D"
              }
            />
            <span className="shrink-0 text-[14px] leading-[22px] whitespace-nowrap text-tw-text-primary">
              {first.title}
            </span>
          </div>
          {first.action ? (
            <span
              role="button"
              tabIndex={0}
              onClick={handleAction}
              onKeyDown={handleActionKeyDown}
              aria-label={first.action.label}
              className="flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[10px] bg-[#363639] px-2.5 whitespace-nowrap text-tw-text-primary transition-colors hover:bg-[#404044] focus:outline-none focus-visible:ring-2 focus-visible:ring-tw-text-primary"
            >
              {first.action.kind === "close" ? (
                <EventCloseCircleSolidIcon />
              ) : first.action.kind === "pause" ? (
                <EventPauseHourglassIcon />
              ) : null}
              <span className="text-center text-[13px] leading-none text-tw-text-primary">
                {first.action.label}
              </span>
            </span>
          ) : null}
        </div>
      </div>
    </div>
  )
}

interface SingleUserPreviewProps {
  user: User
  preview: string
}

function SingleUserPreview({ user, preview }: SingleUserPreviewProps) {
  const [head, rest] = (() => {
    if (preview.includes("Payout")) {
      return [
        preview.split(" Payout")[0],
        "Payout" + preview.split(" Payout")[1],
      ]
    }
    return [preview, ""]
  })()

  return (
    <div className="flex gap-1">
      <div
        className="flex h-[25px] w-[25px] min-w-4 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cover bg-center"
        style={{ backgroundImage: `url('${user.avatar}')` }}
      />
      <div className="flex min-w-0 grow basis-0 items-start gap-2">
        <div className="min-w-0 grow basis-0">
          <div>
            <div className="inline-flex">
              <div className="flex items-center gap-1 rounded-lg px-1 py-[1px]">
                <span className="text-[14px] leading-5 text-tw-text-primary">
                  {user.username}
                </span>
              </div>
            </div>
            <div className="inline-block text-[14px] leading-[25px] whitespace-pre-wrap text-tw-text-secondary">
              {head}
              {rest ? (
                <>
                  {" "}
                  <span className="text-tw-text-secondary">
                    Payout wallets:
                  </span>
                  {"  "}
                  <span className="font-mono text-tw-text-secondary">
                    {rest.replace(/^Payout wallets:\s*/, "")}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

interface MultiUserRowProps {
  userKeys: string[]
}

function MultiUserRow({ userKeys }: MultiUserRowProps) {
  const uniqueKeys = [...new Set(userKeys)]

  return (
    <div className="flex items-center gap-1">
      <div className="flex items-center gap-[5px]">
        {uniqueKeys.slice(0, 6).map((username, index) => {
          const user = getUser(username)
          return (
            <div
              key={`${username}-${index}`}
              className="flex items-center gap-0"
            >
              <div
                className="h-[18px] w-[18px] shrink-0 rounded-full bg-cover bg-center"
                style={{ backgroundImage: `url('${user.avatar}')` }}
              />
              <div className="relative h-5 shrink-0">
                <span className="absolute top-0 left-[2px] text-[14px] leading-5 whitespace-nowrap text-tw-text-primary">
                  {user.username}
                </span>
                <span className="invisible px-[2px] text-[14px] leading-5">
                  {user.username}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
