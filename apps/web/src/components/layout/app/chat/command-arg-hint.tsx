import type { ParsedCommand } from "#/lib/chat/commands"

interface CommandArgHintProps {
  parsed: ParsedCommand
}

/**
 * Compact strip above the input after the user finishes the command token (space typed),
 * so slash mode still feels anchored while typing arguments.
 */
export function CommandArgHint({ parsed }: CommandArgHintProps) {
  const { command: cmd, args } = parsed
  const argText = args.trim()
  const hasArgs = argText.length > 0

  let secondary: string | null = null
  if (cmd.requiresArg && !hasArgs) {
    secondary = cmd.example ?? `${cmd.command} …`
  } else if (hasArgs) {
    const preview = argText.length > 48 ? `${argText.slice(0, 45)}…` : argText
    secondary = `${preview} · Enter to run`
  } else {
    secondary = "Enter to run"
  }

  return (
    <div
      className="absolute right-1.5 bottom-full left-1.5 z-20 mb-1.5 overflow-hidden rounded-2xl bg-tw-card p-2.5 shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]"
      role="status"
      aria-live="polite"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-tw-text-primary">
          {cmd.label}
        </span>
        {secondary ? (
          <span className="truncate font-mono text-[12px] text-tw-text-muted">
            {secondary}
          </span>
        ) : null}
      </div>
    </div>
  )
}
