import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#/integrations/trpc/react";

const STORAGE_PREFIX = "tripwire:events:lastViewedAt:";
const EVENT_NAME = "tripwire:events-viewed";

function storageKey(repoId: string): string {
	return `${STORAGE_PREFIX}${repoId}`;
}

function readLastViewed(repoId: string | undefined): string | null {
	if (!repoId || typeof window === "undefined") return null;
	return window.localStorage.getItem(storageKey(repoId));
}

/**
 * Whether the events nav icon should show an "unread" dot for the given repo.
 * True when the newest event's createdAt is newer than the timestamp written
 * by `markEventsViewed`.
 */
export function useEventsUnread(repoId: string | undefined): boolean {
	const trpc = useTRPC();
	const { data } = useQuery({
		...trpc.events.list.queryOptions({ repoId: repoId ?? "", limit: 1, offset: 0 }),
		enabled: !!repoId,
		staleTime: 30_000,
		refetchInterval: 30_000,
	});

	const [lastViewed, setLastViewed] = useState<string | null>(() => readLastViewed(repoId));

	useEffect(() => {
		setLastViewed(readLastViewed(repoId));
	}, [repoId]);

	useEffect(() => {
		if (typeof window === "undefined") return;
		const onViewed = () => setLastViewed(readLastViewed(repoId));
		window.addEventListener(EVENT_NAME, onViewed);
		return () => window.removeEventListener(EVENT_NAME, onViewed);
	}, [repoId]);

	const latestRow = data?.events?.[0];
	const latestAt = latestRow ? new Date(latestRow.createdAt).getTime() : 0;
	const viewedAt = lastViewed ? new Date(lastViewed).getTime() : 0;
	return latestAt > 0 && latestAt > viewedAt;
}

/**
 * Mark the events page as viewed for the given repo. Writes a timestamp to
 * localStorage and fires a window event so `useEventsUnread` in other
 * components (the nav) re-reads it without waiting for the next poll.
 */
export function markEventsViewed(repoId: string | undefined): void {
	if (!repoId || typeof window === "undefined") return;
	window.localStorage.setItem(storageKey(repoId), new Date().toISOString());
	window.dispatchEvent(new Event(EVENT_NAME));
}
