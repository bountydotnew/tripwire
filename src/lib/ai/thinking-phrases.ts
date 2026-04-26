import { useState } from "react";

const THINKING_PHRASES = [
	"Thinking",
	"Pondering",
	"Cooking",
	"Rummaging",
	"Following the scent",
	"Scanning events",
	"Checking contributors",
	"Pulling up data",
	"Tracing activity",
	"Cross-referencing",
	"Parsing signals",
	"Inspecting",
	"Digging in",
	"Untangling",
] as const;

function pickRandomPhrase(): string {
	const idx = Math.floor(Math.random() * THINKING_PHRASES.length);
	return THINKING_PHRASES[idx] ?? "Thinking";
}

export function useThinkingPhrase(): string {
	const [phrase] = useState(pickRandomPhrase);
	return phrase;
}
