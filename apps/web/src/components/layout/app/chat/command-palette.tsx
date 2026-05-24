import { useEffect, useRef } from "react"
import { Button } from "@tripwire/ui/button"
import type { SlashCommand } from "#/lib/chat/commands"
import { cn } from "@tripwire/ui/utils"

interface CommandPaletteProps {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
}

/**
 * Dropdown shown above the chat input when the user is typing a slash
 * command.
 */
export function CommandPalette({
  commands,
  selectedIndex,
  onSelect,
  onHover,
}: CommandPaletteProps) {
  const activeRef = useRef<HTMLButtonElement>(null)
  const safeSelectedIndex = Math.min(selectedIndex, commands.length - 1)
  const selected = commands[safeSelectedIndex]

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" })
  }, [safeSelectedIndex])

  if (commands.length === 0) return null

  return (
    <div className="absolute right-1.5 bottom-full left-1.5 z-50 mb-1.5 overflow-hidden rounded-2xl bg-tw-card p-1.5 shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]">
      <div className="mb-1 px-2 pt-0.5 pb-1 text-[10px] font-medium tracking-wider text-tw-text-tertiary uppercase">
        Commands
      </div>
      <div className="max-h-[260px] overflow-y-auto px-2">
        {commands.map((cmd, i) => {
          const isActive = i === safeSelectedIndex
          return (
            <Button
              variant="ghost"
              key={cmd.command}
              ref={isActive ? activeRef : undefined}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => onSelect(cmd)}
              onMouseEnter={() => onHover(i)}
              className={cn(
                // Ghost buttons default to justify-center — flatten rows to a shared left edge.
                "h-auto min-h-0 w-full justify-start gap-2 rounded-lg px-2 py-2 text-left whitespace-normal shadow-none sm:h-auto",
                isActive ? "bg-tw-hover" : "hover:bg-tw-hover"
              )}
            >
              <span className="grid w-full min-w-0 grid-cols-[9rem_1fr] items-baseline gap-x-3 gap-y-0">
                <span className="font-mono text-[13px] font-medium text-tw-text-primary tabular-nums">
                  {cmd.command}
                </span>
                <span className="min-w-0 truncate text-[12px] text-tw-text-muted">
                  {cmd.description}
                </span>
              </span>
            </Button>
          )
        })}
      </div>
      <div
        className="mt-1 border-t border-tw-border/40 px-2 pt-2 pb-1"
        aria-hidden
      >
        <div className="min-h-[14px] truncate font-mono text-[11px] text-tw-text-muted">
          {selected?.example ?? "\u00a0"}
        </div>
        <div className="mt-1 text-[10px] leading-tight text-tw-text-tertiary">
          <span className="whitespace-nowrap">↑↓ navigate</span>
          <span className="mx-1 opacity-60">·</span>
          <span>Tab complete</span>
          <span className="mx-1 opacity-60">·</span>
          <span>Enter run</span>
        </div>
      </div>
    </div>
  )
}
