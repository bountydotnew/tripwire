export type ListedUserStatus = "blacklist" | "whitelist";

export interface ListedUserSuggestion {
	githubUsername: string;
	avatarUrl?: string | null;
	list: ListedUserStatus;
}

export interface MentionTrigger {
	query: string;
	start: number;
	end: number;
}

const MAX_SUGGESTIONS = 6;

export function getMentionTrigger(value: string, cursorPosition: number): MentionTrigger | null {
	const beforeCursor = value.slice(0, cursorPosition);
	const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9_-]*)$/);
	if (!match) return null;

	const query = match[2] ?? "";
	const start = cursorPosition - query.length - 1;

	return {
		query,
		start,
		end: cursorPosition,
	};
}

export function buildListedUserSuggestions(
	users: ListedUserSuggestion[],
	query: string,
): ListedUserSuggestion[] {
	const normalizedQuery = query.trim().replace(/^@/, "").toLowerCase();
	const seen = new Set<string>();
	const suggestions: ListedUserSuggestion[] = [];

	for (const user of users) {
		const usernameKey = user.githubUsername.toLowerCase();
		if (seen.has(usernameKey)) continue;
		if (normalizedQuery && !usernameKey.startsWith(normalizedQuery)) continue;

		seen.add(usernameKey);
		suggestions.push(user);
	}

	return suggestions.slice(0, MAX_SUGGESTIONS);
}

export function replaceMentionTrigger(
	value: string,
	trigger: MentionTrigger,
	username: string,
): { value: string; cursorPosition: number } {
	const before = value.slice(0, trigger.start);
	const after = value.slice(trigger.end);
	const inserted = `@${username}`;
	const needsSpaceAfter = after.length === 0 || /^\s/.test(after);
	const nextValue = `${before}${inserted}${needsSpaceAfter ? "" : " "}${after}`;
	const cursorPosition = before.length + inserted.length + (needsSpaceAfter ? 0 : 1);

	return { value: nextValue, cursorPosition };
}
