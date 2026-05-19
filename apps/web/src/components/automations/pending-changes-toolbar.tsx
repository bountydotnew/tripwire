import { useEffect, useState } from "react"
import { Button } from "#/components/ui/button"
import {
  SmallPlusStrokeIcon12,
  SmallCheckStrokeIcon12,
  SmallXStrokeIcon12,
} from "#/components/icons/app-chrome-icons"
import { cn } from "@tripwire/ui/utils"

interface PendingChangesToolbarProps {
  summary: string
  onAccept: () => void
  onCancel: () => void
}

export function PendingChangesToolbar({
  summary,
  onAccept,
  onCancel,
}: PendingChangesToolbarProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={cn(
        "absolute bottom-4 left-1/2 z-20 -translate-x-1/2",
        "flex items-center gap-3 rounded-xl px-4 py-2.5",
        "border border-tw-border bg-tw-card/95 shadow-lg backdrop-blur-sm",
        "transition-all duration-300 ease-out",
        visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-5 items-center justify-center rounded-md bg-tw-accent/15">
          <SmallPlusStrokeIcon12 className="text-tw-accent" />
        </span>
        <span className="text-[13px] font-medium text-tw-text-primary">
          AI proposed changes
        </span>
      </div>

      <span className="text-[12px] text-tw-text-muted">{summary}</span>

      <div className="ml-1 flex items-center gap-1.5">
        <Button
          variant="ghost"
          type="button"
          onClick={onAccept}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-tw-success/15 px-3 text-[12px] font-medium text-tw-success transition-colors hover:bg-tw-success/25"
        >
          <SmallCheckStrokeIcon12 className="text-tw-success" />
          Accept
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={onCancel}
          className="flex h-7 items-center gap-1.5 rounded-lg bg-tw-hover px-3 text-[12px] font-medium text-tw-text-muted transition-colors hover:bg-[#FFFFFF12] hover:text-tw-text-primary"
        >
          <SmallXStrokeIcon12 className="text-tw-text-muted" />
          Revert
        </Button>
      </div>
    </div>
  )
}
