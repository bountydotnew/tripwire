import { useState, useRef, type KeyboardEvent, type ChangeEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";

interface ChatInputProps {
	value: string;
	onChange: (val: string) => void;
	onSubmit: () => void;
	isLoading: boolean;
	isDisabled?: boolean;
	placeholder?: string;
	actions?: ReactNode;
	className?: string;
	style?: React.CSSProperties;
}

export function ChatInput({
	value,
	onChange,
	onSubmit,
	isLoading,
	isDisabled,
	placeholder = "Ask anything...",
	actions,
	className = "flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5 w-full relative",
	style,
}: ChatInputProps) {
	const { repo } = useWorkspace();
	const trpc = useTRPC();
	const inputRef = useRef<HTMLInputElement>(null);

	// Mention state
	const [mentionActive, setMentionActive] = useState(false);
	const [mentionQuery, setMentionQuery] = useState("");
	const [mentionIdx, setMentionIdx] = useState(0);
	const [mentionStart, setMentionStart] = useState(-1);

	const mentionsQuery = useQuery(
		trpc.whitelist.mentions.queryOptions(
			{ repoId: repo?.id ?? "" },
			{ enabled: mentionActive && !!repo?.id, staleTime: 60_000 },
		),
	);

	const mentions = mentionsQuery.data;
	const mentionItems = mentions
		? [
				...mentions.whitelisted.map((u) => ({ ...u, list: "whitelist" as const })),
				...mentions.blacklisted.map((u) => ({ ...u, list: "blacklist" as const })),
			].filter((u) => u.githubUsername.toLowerCase().includes(mentionQuery.toLowerCase()))
		: [];
	const mentionCount = mentionItems.length;

	const detectMention = (val: string, cursorPos: number) => {
		const atIdx = val.lastIndexOf("@", cursorPos - 1);
		if (atIdx === -1 || val.slice(atIdx + 1, cursorPos).includes(" ")) {
			setMentionActive(false);
			return;
		}
		setMentionStart(atIdx);
		setMentionQuery(val.slice(atIdx + 1, cursorPos));
		setMentionActive(true);
		setMentionIdx(0);
	};

	const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
		const val = e.target.value;
		onChange(val);
		detectMention(val, e.target.selectionStart ?? val.length);
	};

	const selectMention = (username: string) => {
		if (!inputRef.current || mentionStart === -1) return;
		const before = value.slice(0, mentionStart);
		const after = value.slice(inputRef.current.selectionStart ?? mentionStart);
		const newValue = `${before}@${username} ${after}`;
		onChange(newValue);
		setMentionActive(false);
		setMentionStart(-1);
		setMentionQuery("");
		setTimeout(() => {
			const pos = before.length + username.length + 2;
			inputRef.current?.focus();
			inputRef.current?.setSelectionRange(pos, pos);
		}, 0);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (mentionActive) {
			if (e.key === "Escape") {
				setMentionActive(false);
				e.preventDefault();
				return;
			}
			if (e.key === "ArrowDown") {
				setMentionIdx((i) => Math.min(i + 1, mentionCount - 1));
				e.preventDefault();
				return;
			}
			if (e.key === "ArrowUp") {
				setMentionIdx((i) => Math.max(i - 1, 0));
				e.preventDefault();
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				if (mentionItems[mentionIdx]) selectMention(mentionItems[mentionIdx].githubUsername);
				return;
			}
		}
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			if (!value.trim() || isLoading || isDisabled) return;
			setMentionActive(false);
			setMentionQuery("");
			onSubmit();
		}
	};

	return (
		<div className={className} style={style}>
			{mentionActive && mentionCount > 0 && (
				<div className="absolute bottom-full left-4 right-4 rounded-t-[12px] rounded-b-none bg-tw-card border border-b-0 border-tw-border overflow-hidden max-h-[180px] overflow-y-auto shadow-2xl z-50">
					{mentionItems.map((user, i) => (
						<button
							key={`${user.list}-${user.githubUsername}`}
							type="button"
							onMouseDown={(e) => {
								e.preventDefault();
								selectMention(user.githubUsername);
							}}
							onMouseEnter={() => setMentionIdx(i)}
							className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left transition-colors ${
								i === mentionIdx ? "bg-tw-hover" : ""
							}`}
						>
							<img
								src={user.avatarUrl ?? `https://github.com/${user.githubUsername}.png?size=40`}
								alt=""
								className="w-5 h-5 rounded-full bg-tw-hover shrink-0"
							/>
							<span className="text-[13px] text-tw-text-primary font-medium">@{user.githubUsername}</span>
							<span
								className={`ml-auto text-[10px] font-medium px-1.5 py-px rounded-full shrink-0 ${
									user.list === "whitelist"
										? "bg-emerald-500/10 text-emerald-400"
										: "bg-red-500/10 text-red-400"
								}`}
							>
								{user.list}
							</span>
						</button>
					))}
				</div>
			)}
			{mentionActive && mentionCount === 0 && mentionQuery.length > 0 && !mentionsQuery.isFetching && (
				<div className="absolute bottom-full left-4 right-4 rounded-t-[12px] rounded-b-none bg-tw-card border border-b-0 border-tw-border px-2.5 py-2 z-50 shadow-2xl">
					<span className="text-[12px] text-tw-text-muted">No list users match "@{mentionQuery}"</span>
				</div>
			)}
			<div className="flex items-center w-full gap-1.5">
				<input
					ref={inputRef}
					type="text"
					placeholder={placeholder}
					value={value}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					disabled={isLoading || isDisabled}
					className="flex-1 h-9 bg-tw-inner rounded-[10px] px-2.5 text-[14px] text-tw-text-primary placeholder:text-tw-text-tertiary outline-none disabled:opacity-50"
				/>
				<button
					type="button"
					className="flex items-center justify-center size-9 rounded-[10px] text-tw-text-tertiary hover:text-tw-text-secondary transition-colors"
				>
					<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
						<path d="M8 1a2 2 0 0 0-2 2v4a2 2 0 1 0 4 0V3a2 2 0 0 0-2-2Z" />
						<path d="M4.5 7A.75.75 0 0 0 3 7a5.001 5.001 0 0 0 4.25 4.944V13.5h-1.5a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-1.5v-1.556A5.001 5.001 0 0 0 13 7a.75.75 0 0 0-1.5 0 3.5 3.5 0 1 1-7 0Z" />
					</svg>
				</button>
			</div>
			<div className="flex items-center justify-between w-full pt-1.5">
				<div className="flex items-center gap-1">{actions}</div>
				<button
					type="button"
					onClick={() => {
						if (!value.trim() || isLoading || isDisabled) return;
						setMentionActive(false);
						setMentionQuery("");
						onSubmit();
					}}
					disabled={!value.trim() || isLoading || isDisabled}
					className="flex items-center self-stretch px-1.5 rounded-[10px] justify-center gap-1 bg-[#363639] hover:bg-[#404044] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<span className="text-[14px] leading-none text-center text-tw-text-primary px-0.5">
						{isLoading ? "..." : "Go"}
					</span>
					<span
						className="flex items-center h-4 rounded-sm justify-center pt-[3px] pb-0 bg-[#222222] px-1"
						style={{ boxShadow: "#0000001A 0px 1px 1px" }}
					>
						<span className="text-[11px] text-center text-tw-text-tertiary leading-none">
							{"\u21B5"}
						</span>
					</span>
				</button>
			</div>
		</div>
	);
}
