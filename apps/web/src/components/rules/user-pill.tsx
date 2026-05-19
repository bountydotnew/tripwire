import { CloseIcon } from "../icons/close-icon"
import { Button } from "#/components/ui/button"

interface UserPillProps {
  username: string
  avatarUrl: string
  onRemove?: () => void
}

export function UserPill({ username, avatarUrl, onRemove }: UserPillProps) {
  return (
    <div className="flex items-center justify-center gap-2 rounded-full border border-[#353434] bg-[oklch(26.4%_0_0)] px-[3px] py-0.5">
      <div className="flex items-start gap-1.5">
        <div
          className="h-[17px] w-[17px] shrink-0 rounded-full bg-cover bg-center"
          style={{ backgroundImage: `url(${avatarUrl})` }}
        />
        <span className="text-center text-xs font-medium text-white">
          @{username}
        </span>
      </div>
      <Button
        onClick={onRemove}
        variant="ghost"
        size="icon-xs"
        className="size-4 p-0"
      >
        <CloseIcon className="size-3 text-white/50" />
      </Button>
    </div>
  )
}
