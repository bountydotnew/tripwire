import {
	useId,
	useMemo,
	useRef,
	useState,
	type KeyboardEvent,
	type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { CloseIcon } from "#/components/icons/close-icon";
import { MicIcon, PlusIcon } from "#/components/icons/nav-icons";
import { useTRPC } from "#/integrations/trpc/react";
import { cn } from "#/lib/utils";
import { useWorkspace } from "#/lib/workspace-context";
import {
	buildListedUserSuggestions,
	composeMentionMessage,
	getMentionTrigger,
	replaceMentionTrigger,
	type ListedUserMention,
} from "#/lib/chat/mentions";

interface ChatComposerProps {
	className?: string;
	contextActionAdornment?: ReactNode;
	disabled?: boolean;
	isLoading?: boolean;
	placeholder?: string;
	onSend: (message: string) => void;
}

function statusClasses(status: ListedUserMention["status"]) {
	return status === "blacklisted"
		? "border-[#F56D5D26] bg-[#F56D5D14] text-[#F2A39A]"
		: "border-[#67E19F26] bg-[#67E19F14] text-[#A7E9C3]";
}

function MentionAvatar({ user, size = "size-5" }: { user: ListedUserMention; size?: string }) {
	if (user.avatarUrl) {
		return (
			<img
				src={user.avatarUrl}
				alt=""
				className={`${size} shrink-0 rounded-full bg-tw-inner`}
				loading="lazy"
			/>
		);
	}

	return (
		<span
			className={`${size} flex shrink-0 items-center justify-center rounded-full bg-tw-inner text-[10px] text-tw-text-tertiary`}
		>
			{user.username.slice(0, 1).toUpperCase()}
		</span>
	);
}

export function ChatComposer({
	className,
	contextActionAdornment,
	disabled = false,
	isLoading = false,
	placeholder = "Ask anything...",
	onSend,
}: ChatComposerProps) {
	const { repo } = useWorkspace();
	const trpc = useTRPC();
	const suggestionListId = `${useId()}-mention-suggestions`;
	const inputRef = useRef<HTMLInputElement>(null);
	const [text, setText] = useState("");
	const [cursorPosition, setCursorPosition] = useState(0);
	const [mentions, setMentions] = useState<ListedUserMention[]>([]);
	const [highlightedIndex, setHighlightedIndex] = useState(0);
	const [dismissedTriggerKey, setDismissedTriggerKey] = useState<string | null>(null);

	const whitelistQuery = useQuery(
		trpc.whitelist.list.queryOptions(
			{ repoId: repo?.id ?? "" },
			{ enabled: !!repo?.id },
		),
	);
	const blacklistQuery = useQuery(
		trpc.blacklist.list.queryOptions(
			{ repoId: repo?.id ?? "" },
			{ enabled: !!repo?.id },
		),
	);

	const trigger = getMentionTrigger(text, cursorPosition);
	const triggerKey = trigger ? `${trigger.start}:${trigger.end}:${trigger.query}` : null;

	const suggestions = useMemo(() => {
		if (!trigger) return [];

		const blacklist: ListedUserMention[] = (blacklistQuery.data ?? []).map((entry) => ({
			username: entry.githubUsername,
			avatarUrl: entry.avatarUrl,
			status: "blacklisted",
		}));
		const whitelist: ListedUserMention[] = (whitelistQuery.data ?? []).map((entry) => ({
			username: entry.githubUsername,
			avatarUrl: entry.avatarUrl,
			status: "whitelisted",
		}));

		return buildListedUserSuggestions(
			blacklist,
			whitelist,
			trigger.query,
			mentions.map((mention) => mention.username),
		);
	}, [blacklistQuery.data, mentions, trigger, whitelistQuery.data]);

	const showSuggestions =
		!disabled && !!trigger && triggerKey !== dismissedTriggerKey && suggestions.length > 0;
	const composedMessage = composeMentionMessage(mentions, text);
	const activeSuggestion = showSuggestions ? suggestions[highlightedIndex] : undefined;
	const activeSuggestionId = activeSuggestion
		? `${suggestionListId}-${activeSuggestion.status}-${activeSuggestion.username.toLowerCase()}`
		: undefined;

	function updateCursor(element: HTMLInputElement) {
		setCursorPosition(element.selectionStart ?? element.value.length);
	}

	function selectMention(user: ListedUserMention) {
		if (!trigger) return;

		const nextText = replaceMentionTrigger(text, trigger);
		const beforeTrigger = text.slice(0, trigger.start).trimEnd();
		const afterTrigger = text.slice(trigger.end).trimStart();
		const nextCursorPosition =
			beforeTrigger.length > 0 && afterTrigger.length > 0
				? beforeTrigger.length + 1
				: beforeTrigger.length;

		setDismissedTriggerKey(null);
		setMentions((current) => [...current, user]);
		setText(nextText);
		setHighlightedIndex(0);
		window.requestAnimationFrame(() => {
			const input = inputRef.current;
			if (!input) return;
			input.focus();
			const nextPosition = Math.min(nextCursorPosition, input.value.length);
			input.setSelectionRange(nextPosition, nextPosition);
			setCursorPosition(nextPosition);
		});
	}

	function removeMention(username: string) {
		setMentions((current) =>
			current.filter((mention) => mention.username.toLowerCase() !== username.toLowerCase()),
		);
	}

	function sendMessage() {
		const message = composedMessage.trim();
		if (!message || disabled) return;

		onSend(message);
		setText("");
		setMentions([]);
		setDismissedTriggerKey(null);
		setHighlightedIndex(0);
	}

	function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
		if (event.nativeEvent.isComposing) {
			return;
		}

		if (showSuggestions && event.key === "ArrowDown") {
			event.preventDefault();
			setHighlightedIndex((current) => (current + 1) % suggestions.length);
			return;
		}

		if (showSuggestions && event.key === "ArrowUp") {
			event.preventDefault();
			setHighlightedIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
			return;
		}

		if (showSuggestions && event.key === "Enter") {
			event.preventDefault();
			const highlighted = suggestions[highlightedIndex];
			if (highlighted) selectMention(highlighted);
			return;
		}

		if (showSuggestions && event.key === "Escape") {
			event.preventDefault();
			setDismissedTriggerKey(triggerKey);
			return;
		}

		if (event.key === "Backspace" && text.length === 0 && mentions.length > 0) {
			removeMention(mentions[mentions.length - 1].username);
			return;
		}

		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault();
			sendMessage();
		}
	}

	return (
		<div
			className={cn(
				"relative flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5",
				className,
			)}
		>
			{showSuggestions ? (
				<div
					id={suggestionListId}
					role="listbox"
					className="absolute bottom-full left-1.5 right-1.5 z-20 mb-1.5 overflow-hidden rounded-2xl bg-tw-card p-1.5 shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]"
				>
					{suggestions.map((user, index) => {
						const optionId =
							`${suggestionListId}-${user.status}-${user.username.toLowerCase()}`;

						return (
							<button
								type="button"
								id={optionId}
								role="option"
								tabIndex={-1}
								aria-selected={index === highlightedIndex}
								key={optionId}
								onMouseDown={(event) => {
									event.preventDefault();
									selectMention(user);
								}}
								className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
									index === highlightedIndex ? "bg-tw-hover" : "hover:bg-tw-hover"
								}`}
							>
								<MentionAvatar user={user} />
								<span className="min-w-0 flex-1 truncate text-[13px] text-tw-text-primary">
									@{user.username}
								</span>
								<span
									className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium capitalize ${statusClasses(user.status)}`}
								>
									{user.status}
								</span>
							</button>
						);
					})}
				</div>
			) : null}

			<div className="flex min-h-9 w-full flex-wrap items-center gap-1.5">
				{mentions.map((user) => (
					<span
						key={`${user.status}-${user.username}`}
						className={`inline-flex h-8 items-center gap-1.5 rounded-[10px] border px-1.5 pr-1 text-[12px] ${statusClasses(user.status)}`}
					>
						<MentionAvatar user={user} size="size-4" />
						<span className="max-w-[120px] truncate">@{user.username}</span>
						<button
							type="button"
							onClick={() => removeMention(user.username)}
							className="flex size-4 items-center justify-center rounded-md text-current opacity-70 transition-opacity hover:opacity-100"
							aria-label={`Remove @${user.username}`}
						>
							<CloseIcon className="size-2.5" />
						</button>
					</span>
				))}

				<input
					ref={inputRef}
					type="text"
					placeholder={mentions.length > 0 ? "" : placeholder}
					value={text}
					onChange={(event) => {
						setText(event.target.value);
						updateCursor(event.target);
						setDismissedTriggerKey(null);
						setHighlightedIndex(0);
					}}
					onClick={(event) => updateCursor(event.currentTarget)}
					onKeyUp={(event) => updateCursor(event.currentTarget)}
					onKeyDown={handleKeyDown}
					disabled={disabled}
					role="combobox"
					aria-autocomplete="list"
					aria-controls={suggestionListId}
					aria-expanded={showSuggestions}
					aria-activedescendant={activeSuggestionId}
					className="h-9 min-w-[120px] flex-1 rounded-[10px] bg-tw-inner px-2.5 text-[14px] text-tw-text-primary outline-none placeholder:text-tw-text-tertiary disabled:opacity-50"
				/>
				<button
					type="button"
					aria-label="Voice input unavailable"
					title="Voice input unavailable"
					disabled
					className="flex size-9 items-center justify-center rounded-[10px] text-tw-text-tertiary transition-colors hover:text-tw-text-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-tw-text-tertiary"
				>
					<MicIcon />
				</button>
			</div>
			<div className="flex w-full items-center justify-between pt-1.5">
				<div className="flex items-center gap-1">
					<button
						type="button"
						className="flex h-7 items-center gap-1 rounded-lg px-2 text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
					>
						<PlusIcon />
						<span className="text-[12px]">Add files</span>
					</button>
					<button
						type="button"
						className="flex h-7 items-center gap-1 rounded-lg px-2 text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
					>
						<PlusIcon />
						<span className="text-[12px]">Add context</span>
						{contextActionAdornment}
					</button>
				</div>
				<button
					type="button"
					onClick={sendMessage}
					disabled={!composedMessage.trim() || disabled}
					className="flex items-center justify-center gap-1 self-stretch rounded-[10px] bg-[#363639] px-1.5 transition-colors hover:bg-[#404044] disabled:cursor-not-allowed disabled:opacity-50"
				>
					<span className="px-0.5 text-center text-[14px] leading-none text-tw-text-primary">
						{isLoading ? "..." : "Go"}
					</span>
					<span
						className="flex h-4 items-center justify-center rounded-sm bg-[#222222] px-1 pb-0 pt-[3px]"
						style={{ boxShadow: "#0000001A 0px 1px 1px" }}
					>
						<span className="text-center text-[11px] leading-none text-tw-text-tertiary">
							{"\u21B5"}
						</span>
					</span>
				</button>
			</div>
		</div>
	);
}
