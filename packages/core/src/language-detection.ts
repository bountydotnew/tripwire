/**
 * Unicode-based language/script detection for moderation.
 *
 * Analyses the dominant script of natural-language text by counting
 * code points in well-known Unicode ranges. Code blocks, URLs, and
 * identifiers are stripped before analysis so that only prose is scored.
 *
 * Exported for direct use and testing; the filter pipeline calls
 * `isLikelyLanguage()` internally.
 */

export interface LanguageDetectionResult {
	dominant: string;
	confidence: number;
	counts: Record<string, number>;
}

/** Strip noise that skews language detection (code blocks, URLs, identifiers). */
export function cleanForLanguageDetection(text: string): string {
	return text
		.replace(/```[\s\S]*?```/g, "")        // fenced code blocks
		.replace(/`[^`]+`/g, "")                // inline code
		.replace(/https?:\/\/\S+/g, "")         // URLs
		.replace(/[a-zA-Z_$][a-zA-Z0-9_$.]*\(/g, "") // function calls
		.replace(/\b[A-Z][a-z]+(?:[A-Z][a-z]+)+\b/g, "") // CamelCase identifiers
		.replace(/\b[a-z]+(?:_[a-z]+)+\b/g, "") // snake_case identifiers
		.replace(/#\S+/g, "")                    // hashtags / issue refs
		.replace(/@\S+/g, "");                   // @mentions
}

const SCRIPT_LANGUAGES: Record<string, string> = {
	latin: "english",
	cjk: "chinese",
	cyrillic: "russian",
	arabic: "arabic",
	devanagari: "hindi",
	hangul: "korean",
	kana: "japanese",
};

export function detectLanguageScript(text: string): LanguageDetectionResult {
	const cleaned = cleanForLanguageDetection(text);
	const counts: Record<string, number> = {
		latin: 0,
		cjk: 0,
		cyrillic: 0,
		arabic: 0,
		devanagari: 0,
		hangul: 0,
		kana: 0,
	};

	for (const char of cleaned) {
		const code = char.codePointAt(0)!;
		if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A) ||
			(code >= 0xC0 && code <= 0x24F)) {
			counts.latin++;
		} else if (code >= 0x4E00 && code <= 0x9FFF) {
			counts.cjk++;
		} else if (code >= 0x0400 && code <= 0x04FF) {
			counts.cyrillic++;
		} else if (code >= 0x0600 && code <= 0x06FF) {
			counts.arabic++;
		} else if (code >= 0x0900 && code <= 0x097F) {
			counts.devanagari++;
		} else if (code >= 0xAC00 && code <= 0xD7AF) {
			counts.hangul++;
		} else if ((code >= 0x3040 && code <= 0x309F) || (code >= 0x30A0 && code <= 0x30FF)) {
			counts.kana++;
		}
	}

	const total = Object.values(counts).reduce((a, b) => a + b, 0);
	if (total === 0) return { dominant: "unknown", confidence: 0, counts };

	let dominantScript = "unknown";
	let maxCount = 0;
	for (const [script, count] of Object.entries(counts)) {
		if (count > maxCount) {
			maxCount = count;
			dominantScript = script;
		}
	}

	const dominant = SCRIPT_LANGUAGES[dominantScript] ?? dominantScript;

	return { dominant, confidence: maxCount / total, counts };
}
