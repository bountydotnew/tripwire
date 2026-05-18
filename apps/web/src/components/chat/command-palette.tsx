import { useEffect, useRef } from "react";
import type { SlashCommand } from "#/lib/chat-commands";

interface CommandPaletteProps {
	commands: SlashCommand[];
	selectedIndex: number;
	onSelect: (command: SlashCommand) => void;
	onHover: (index: number) => void;
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
	const activeRef = useRef<HTMLButtonElement>(null);
	const safeSelectedIndex = Math.min(selectedIndex, commands.length - 1);

	// Keep the highlighted row scrolled into view as the user arrows through.
	useEffect(() => {
		activeRef.current?.scrollIntoView({ block: "nearest" });
	}, [safeSelectedIndex]);

	if (commands.length === 0) return null;

	return (
		<div className="absolute z-50 bottom-full left-0 right-0 mb-1.5 rounded-xl bg-tw-card border border-tw-border overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
			<div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-tw-text-tertiary border-b border-tw-border/50">
				Commands
			</div>
			<div className="max-h-[260px] overflow-y-auto py-1">
				{commands.map((cmd, i) => {
					const isActive = i === safeSelectedIndex;
					return (
						<button
							key={cmd.command}
							ref={isActive ? activeRef : undefined}
							type="button"
							onMouseDown={(event) => {
								event.preventDefault();
								onSelect(cmd);
							}}
							onMouseEnter={() => onHover(i)}
							className={`w-full text-left px-3 py-1.5 flex items-baseline gap-2.5 transition-colors ${
								isActive ? "bg-tw-hover" : ""
							}`}
						>
							<span className="text-[13px] font-medium text-tw-text-primary tabular-nums shrink-0 min-w-[88px]">
								{cmd.command}
							</span>
							<span className="text-[12px] text-tw-text-muted truncate">
								{cmd.description}
							</span>
						</button>
					);
				})}
			</div>
		</div>
	);
}
