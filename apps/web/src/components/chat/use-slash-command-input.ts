import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type RefObject } from "react";
import { filterCommands, type SlashCommand } from "#/lib/chat-commands";

interface UseSlashCommandInputOptions {
	inputValue: string;
	setInputValue: (value: string) => void;
	onSubmit: () => void;
	onSelectCommand: (command: SlashCommand) => void;
	inputRef?: RefObject<HTMLInputElement | null>;
}

export function useSlashCommandInput({
	inputValue,
	setInputValue,
	onSubmit,
	onSelectCommand,
	inputRef,
}: UseSlashCommandInputOptions) {
	const [paletteIndex, setPaletteIndex] = useState(0);
	const paletteCommands = useMemo(() => filterCommands(inputValue), [inputValue]);
	const showPalette = inputValue.startsWith("/") && paletteCommands.length > 0;
	const selectedPaletteCommand = showPalette
		? paletteCommands[Math.min(paletteIndex, paletteCommands.length - 1)]
		: undefined;

	const completeSelectedCommand = () => {
		if (!selectedPaletteCommand) return;
		const spaceIdx = inputValue.indexOf(" ");
		if (spaceIdx !== -1) return;

		setInputValue(
			selectedPaletteCommand.requiresArg
				? `${selectedPaletteCommand.command} `
				: selectedPaletteCommand.command,
		);
		setPaletteIndex(0);
		inputRef?.current?.focus();
	};

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		setInputValue(e.target.value);
		setPaletteIndex(0);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (showPalette) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setPaletteIndex((i) => (i + 1) % paletteCommands.length);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setPaletteIndex((i) => (i - 1 + paletteCommands.length) % paletteCommands.length);
				return;
			}
			if (e.key === "Tab") {
				e.preventDefault();
				completeSelectedCommand();
				return;
			}
			if (e.key === "Enter") {
				e.preventDefault();
				if (selectedPaletteCommand) onSelectCommand(selectedPaletteCommand);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setInputValue("");
				return;
			}
		}

		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	};

	return {
		paletteCommands,
		paletteIndex,
		setPaletteIndex,
		showPalette,
		handleInputChange,
		handleKeyDown,
	};
}
