/**
 * Merge a client-side save into DB-owned chat history.
 *
 * The server stream is authoritative for assistant/tool messages. Client saves
 * are useful as a fallback for user messages and titles, but they must not be
 * able to create or rewrite assistant/tool history, especially approvals.
 */
export function mergeMessagesPreservingResults(
	input: unknown[],
	existing: unknown[],
): unknown[] {
	if (existing.length === 0) {
		return input.filter(isUserMessage).map(clone);
	}

	const merged = existing.map(clone);
	const knownIds = new Set(
		merged
			.map((message) => getMessageId(message))
			.filter((id): id is string => typeof id === "string"),
	);

	for (const message of input) {
		if (!isUserMessage(message)) continue;
		const id = getMessageId(message);
		if (id && knownIds.has(id)) continue;
		merged.push(clone(message));
		if (id) knownIds.add(id);
	}

	return merged;
}

type MessageLike = {
	id?: string;
	role?: string;
	parts?: Array<{ type?: string; text?: string; content?: string }>;
};

export function extractChatTitle(messages: unknown[]): string {
	const firstUser = messages.find(isUserMessage) as MessageLike | undefined;
	if (!firstUser) return "New chat";
	const text = getMessageText(firstUser);
	return text.slice(0, 80) || "New chat";
}

function isUserMessage(message: unknown): boolean {
	return (message as MessageLike | undefined)?.role === "user";
}

function getMessageId(message: unknown): string | undefined {
	const id = (message as MessageLike | undefined)?.id;
	return typeof id === "string" ? id : undefined;
}

function getMessageText(message: unknown): string {
	return (message as MessageLike | undefined)?.parts
		?.filter((p) => p.type === "text")
		.map((p) => p.text ?? p.content ?? "")
		.join("") ?? "";
}

function clone<T>(value: T): T {
	return JSON.parse(JSON.stringify(value));
}
