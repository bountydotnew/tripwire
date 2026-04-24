import { useState, useEffect, useRef, useMemo } from "react";
import {
	type DemoMessage,
	DEMO_SCENARIOS,
	AI_SLOP_USER,
	AI_SLOP_SIGNALS,
	AI_SLOP_COMMITS,
} from "./demo-scenarios";
import { USERS, EVENTS_QUIET } from "../home/mock-data";

interface ChatDemoThreadProps {
	scenario?: "ban-flow" | "ai-slop";
}

export function ChatDemoThread({ scenario = "ban-flow" }: ChatDemoThreadProps) {
	const [shownIds, setShownIds] = useState<number[]>([]);
	const [confirming, setConfirming] = useState(false);
	const [confirmed, setConfirmed] = useState(false);
	const [denied, setDenied] = useState(false);
	const bottomRef = useRef<HTMLDivElement>(null);

	const scenarioDef = DEMO_SCENARIOS[scenario] || DEMO_SCENARIOS["ban-flow"];
	const sequence = scenarioDef.sequence;
	const deniedText = scenarioDef.deniedText;

	const shownMessages = useMemo(
		() => sequence.filter((m) => shownIds.includes(m.id)),
		[shownIds, sequence],
	);

	const nextMsg = useMemo(() => {
		if (denied) return null;
		return sequence.find(
			(m) => !shownIds.includes(m.id) && (!m.afterConfirm || confirmed),
		);
	}, [shownIds, confirmed, denied, sequence]);

	useEffect(() => {
		if (!nextMsg || confirming) return;
		const t = setTimeout(() => {
			setShownIds((ids) => [...ids, nextMsg.id]);
			if (nextMsg.type === "confirm") setConfirming(true);
		}, nextMsg.delay);
		return () => clearTimeout(t);
	}, [nextMsg, confirming]);

	useEffect(() => {
		if (shownIds.length > 0) {
			setTimeout(
				() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }),
				50,
			);
		}
	}, [shownIds.length]);

	const handleConfirm = () => {
		setConfirming(false);
		setConfirmed(true);
	};
	const handleDeny = () => {
		setConfirming(false);
		setDenied(true);
	};

	// Show the Tripwire avatar only on the last message of each consecutive AI run
	const avatarMap = useMemo(() => {
		const out: Record<number, boolean> = {};
		for (let i = 0; i < shownMessages.length; i++) {
			const m = shownMessages[i];
			if (m.role !== "ai") continue;
			const next = shownMessages[i + 1];
			const isLastInRun = !next || next.role !== "ai";
			out[m.id] = isLastInRun;
		}
		return out;
	}, [shownMessages]);

	return (
		<div className="flex flex-col gap-3 pt-1 pb-2">
			{shownMessages.map((msg) => (
				<DemoChatMessage
					key={msg.id}
					msg={msg}
					onConfirm={handleConfirm}
					onDeny={handleDeny}
					showAvatar={avatarMap[msg.id] !== false}
				/>
			))}
			{denied && (
				<DemoChatMessage
					key="denied"
					msg={{ id: -1, delay: 0, role: "ai", type: "text", text: deniedText }}
					onConfirm={() => {}}
					onDeny={() => {}}
					showAvatar={true}
				/>
			)}
			<div ref={bottomRef} />
		</div>
	);
}

// ────────────────── Chat Message Components ──────────────────

interface DemoChatMessageProps {
	msg: DemoMessage;
	onConfirm: () => void;
	onDeny: () => void;
	showAvatar: boolean;
}

function DemoChatMessage({
	msg,
	onConfirm,
	onDeny,
	showAvatar,
}: DemoChatMessageProps) {
	if (msg.role === "user") {
		return (
			<div className="flex justify-end px-1">
				<div className="max-w-[86%] px-3 py-2 rounded-2xl rounded-tr-sm bg-[#252528] text-[13px] leading-[19px] text-tw-text-primary">
					{renderInlineText(msg.text || "")}
				</div>
			</div>
		);
	}

	// AI message
	return (
		<div className="flex items-end gap-2 px-1">
			{/* Avatar placeholder - only visible on last message of run */}
			<div className="w-6 shrink-0">
				{showAvatar && (
					<div className="size-6 rounded-full bg-[#FAFAFA14] flex items-center justify-center">
						<TripwireMiniLogo />
					</div>
				)}
			</div>

			<div className="flex-1 min-w-0">
				{msg.type === "tool_call" && (
					<DemoToolCallChip
						toolName={msg.toolName || ""}
						toolArgs={msg.toolArgs || ""}
					/>
				)}
				{msg.type === "text" && (
					<div className="text-[13px] leading-[19px] text-tw-text-primary">
						{renderInlineText(msg.text || "")}
					</div>
				)}
				{msg.type === "event_card" && <DemoEventCard />}
				{msg.type === "confirm" && (
					<DemoConfirmCard
						text={msg.text || ""}
						onConfirm={onConfirm}
						onDeny={onDeny}
						yesLabel={msg.yesLabel}
						noLabel={msg.noLabel}
					/>
				)}
				{msg.type === "ban_result" && <DemoBanResultCard />}
				{msg.type === "user_profile" && <DemoUserProfileCard />}
				{msg.type === "signals_card" && <DemoSignalsCard />}
				{msg.type === "commits_card" && <DemoCommitsCard />}
				{msg.type === "stats_card" && <DemoStatsCard />}
				{msg.type === "verdict_card" && <DemoVerdictCard />}
				{msg.type === "slop_action_result" && <DemoSlopActionResultCard />}
			</div>
		</div>
	);
}

// ────────────────── Inline Text Rendering ──────────────────

function renderInlineText(text: string): React.ReactNode {
	if (!text) return text;
	const regex =
		/(@[A-Za-z0-9][A-Za-z0-9_-]*)|((?:PR|Issue|issue)\s+#\d+)|(#\d+)/g;
	const parts: React.ReactNode[] = [];
	let lastIndex = 0;
	let m: RegExpExecArray | null;
	let key = 0;
	// biome-ignore lint/suspicious/noAssignInExpressions: needed for regex iteration
	while ((m = regex.exec(text)) !== null) {
		if (m.index > lastIndex) parts.push(text.slice(lastIndex, m.index));
		const tok = m[0];
		if (tok.startsWith("@")) {
			parts.push(<UserMentionChip key={`u${key++}`} username={tok.slice(1)} />);
		} else {
			const mm = tok.match(/^(?:(PR|Issue|issue)\s+)?#(\d+)$/);
			const rawLabel = mm?.[1];
			const label = rawLabel
				? rawLabel.toLowerCase() === "issue"
					? "Issue"
					: "PR"
				: null;
			parts.push(
				<IssueChip key={`i${key++}`} label={label} number={mm?.[2] || ""} />,
			);
		}
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

function UserMentionChip({ username }: { username: string }) {
	const user =
		USERS[username] ||
		(AI_SLOP_USER.username.toLowerCase() === username.toLowerCase()
			? AI_SLOP_USER
			: null);
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			{user?.avatar ? (
				<img src={user.avatar} className="w-3.5 h-3.5 rounded-full" alt="" />
			) : (
				<span className="w-3.5 h-3.5 rounded-full bg-[#3a3a3e]" />
			)}
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium">
				@{username}
			</span>
		</span>
	);
}

function IssueChip({ label, number }: { label: string | null; number: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<svg
				width="10"
				height="10"
				viewBox="0 0 16 16"
				fill="none"
				className="shrink-0"
			>
				<circle cx="8" cy="8" r="5.5" stroke="#B4B4B4" strokeWidth="1.2" />
				<circle cx="8" cy="8" r="1.5" fill="#B4B4B4" />
			</svg>
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium tabular-nums">
				{label ? `${label} ` : ""}#{number}
			</span>
		</span>
	);
}

// ────────────────── Card Components ──────────────────

function DemoToolCallChip({
	toolName,
	toolArgs,
}: { toolName: string; toolArgs: string }) {
	const [done, setDone] = useState(false);

	useEffect(() => {
		const t = setTimeout(() => setDone(true), 1100);
		return () => clearTimeout(t);
	}, []);

	return (
		<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
			{done ? (
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					fill="none"
					className="text-tw-success"
				>
					<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
					<path
						d="M4 7L6 9L10 5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
			) : (
				<svg
					width="14"
					height="14"
					viewBox="0 0 14 14"
					className="animate-spin text-tw-text-muted"
				>
					<circle
						cx="7"
						cy="7"
						r="5"
						stroke="currentColor"
						strokeWidth="1.5"
						fill="none"
						strokeDasharray="20"
						strokeDashoffset="5"
					/>
				</svg>
			)}
			<span className="font-mono">{toolName}</span>
			<span className="text-tw-text-tertiary truncate max-w-[140px]">
				{toolArgs}
			</span>
		</div>
	);
}

function DemoEventCard() {
	const event = EVENTS_QUIET[0];
	const user = USERS[event.users[0]];

	return (
		<div className="rounded-xl bg-tw-card p-2 flex items-center gap-2.5">
			<div
				className="size-8 rounded-full bg-cover bg-center shrink-0"
				style={{ backgroundImage: `url('${user?.avatar}')` }}
			/>
			<div className="flex-1 min-w-0">
				<div className="text-[13px] text-tw-text-primary font-medium truncate">
					{event.title}
				</div>
				<div className="text-[11px] text-tw-text-muted truncate">
					{event.repo} {event.ref}
				</div>
			</div>
			<div
				className={`size-2 rounded-full shrink-0 ${event.severity === "warning" ? "bg-tw-warning" : "bg-tw-error"}`}
			/>
		</div>
	);
}

function DemoConfirmCard({
	text,
	onConfirm,
	onDeny,
	yesLabel = "Yes",
	noLabel = "No",
}: {
	text: string;
	onConfirm: () => void;
	onDeny: () => void;
	yesLabel?: string;
	noLabel?: string;
}) {
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[13px] text-tw-text-primary">
				{renderInlineText(text)}
			</div>
			<div className="flex items-center gap-2">
				<button
					type="button"
					onClick={onConfirm}
					className="h-7 px-3 rounded-lg bg-tw-success text-[#0D0D0F] text-[12px] font-medium hover:opacity-90 transition-opacity"
				>
					{yesLabel}
				</button>
				<button
					type="button"
					onClick={onDeny}
					className="h-7 px-3 rounded-lg bg-tw-hover text-tw-text-secondary text-[12px] font-medium hover:text-tw-text-primary transition-colors"
				>
					{noLabel}
				</button>
			</div>
		</div>
	);
}

function DemoBanResultCard() {
	const user = USERS.Dlove123;
	return (
		<div className="rounded-xl bg-[#F56D5D1A] border border-tw-error/20 p-3 flex flex-col gap-2">
			<div className="flex items-center gap-2">
				<div
					className="size-6 rounded-full bg-cover bg-center"
					style={{ backgroundImage: `url('${user?.avatar}')` }}
				/>
				<span className="text-[13px] text-tw-text-primary font-medium">
					@{user?.username} banned
				</span>
			</div>
			<div className="text-[12px] text-tw-text-secondary space-y-1">
				<div className="flex items-center gap-1.5">
					<CheckIcon /> Issue #412 closed
				</div>
				<div className="flex items-center gap-1.5">
					<CheckIcon /> 2 other issues closed
				</div>
				<div className="flex items-center gap-1.5">
					<CheckIcon /> Added to blacklist
				</div>
			</div>
		</div>
	);
}

function DemoUserProfileCard() {
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="flex items-center gap-2.5">
				<div
					className="size-10 rounded-full bg-cover bg-center"
					style={{ backgroundImage: `url('${AI_SLOP_USER.avatar}')` }}
				/>
				<div>
					<div className="text-[14px] text-tw-text-primary font-medium">
						@{AI_SLOP_USER.username}
					</div>
					<div className="text-[12px] text-tw-text-muted">
						Account age: {AI_SLOP_USER.accountAge}
					</div>
				</div>
			</div>
			<div className="grid grid-cols-2 gap-2 text-[12px]">
				<div>
					<span className="text-tw-text-muted">Repos: </span>
					<span className="text-tw-text-secondary">
						{AI_SLOP_USER.publicRepos}
					</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Followers: </span>
					<span className="text-tw-text-secondary">
						{AI_SLOP_USER.followers}
					</span>
				</div>
			</div>
		</div>
	);
}

function DemoSignalsCard() {
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
				Signals matched
			</div>
			<div className="space-y-1.5">
				{AI_SLOP_SIGNALS.map((s, i) => (
					<div key={i} className="flex items-center gap-2 text-[12px]">
						<span
							className={`size-1.5 rounded-full ${s.severity === "high" ? "bg-tw-error" : "bg-tw-warning"}`}
						/>
						<span className="text-tw-text-secondary">{s.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}

function DemoCommitsCard() {
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
				Recent commits
			</div>
			<div className="space-y-1.5">
				{AI_SLOP_COMMITS.map((c, i) => (
					<div
						key={i}
						className="flex items-center gap-2 text-[12px] text-tw-text-secondary"
					>
						<span className="font-mono text-tw-text-muted">{c.hash}</span>
						<span className="truncate flex-1">{c.message}</span>
						<span className="text-tw-text-tertiary shrink-0">{c.files} files</span>
					</div>
				))}
			</div>
		</div>
	);
}

function DemoStatsCard() {
	return (
		<div className="rounded-xl bg-tw-card p-3">
			<div className="grid grid-cols-2 gap-3 text-[12px]">
				<div>
					<span className="text-tw-text-muted">PRs opened: </span>
					<span className="text-tw-text-secondary">1</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Issues opened: </span>
					<span className="text-tw-text-secondary">0</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Comments: </span>
					<span className="text-tw-text-secondary">0</span>
				</div>
				<div>
					<span className="text-tw-text-muted">Commits: </span>
					<span className="text-tw-text-secondary">4</span>
				</div>
			</div>
		</div>
	);
}

function DemoVerdictCard() {
	return (
		<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
			<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
				AI Slop Verdict
			</div>
			<div className="flex items-center gap-2">
				<div className="flex-1 h-2 bg-tw-hover rounded-full overflow-hidden">
					<div
						className="h-full bg-tw-error rounded-full"
						style={{ width: "94%" }}
					/>
				</div>
				<span className="text-[14px] font-medium text-tw-error">94%</span>
			</div>
			<div className="text-[12px] text-tw-text-secondary">
				High confidence this is automated/AI-generated activity
			</div>
		</div>
	);
}

function DemoSlopActionResultCard() {
	return (
		<div className="rounded-xl bg-[#F56D5D1A] border border-tw-error/20 p-3 flex flex-col gap-2">
			<div className="text-[13px] text-tw-text-primary font-medium">
				Actions completed
			</div>
			<div className="text-[12px] text-tw-text-secondary space-y-1">
				<div className="flex items-center gap-1.5">
					<CheckIcon /> PR #812 blocked
				</div>
				<div className="flex items-center gap-1.5">
					<CheckIcon /> @stellar-coder99 added to AI-slop watchlist
				</div>
			</div>
		</div>
	);
}

// ────────────────── Icons ──────────────────

function TripwireMiniLogo() {
	return (
		<svg
			viewBox="0 0 610.08 589.32"
			width="12"
			height="12"
			fill="#B4B4B4"
			preserveAspectRatio="none"
		>
			<path d="M609.85 266.25c-2.93-37.11-34.21-66.57-72.05-66.57H74.66c-42.93-.01-77.81 35.17-74.43 77.96 2.93 37.11 34.21 66.58 72.05 66.58h80.92c19.88 0 37.14-13.09 43.16-32.03 14.65-46.07 57.76-79.45 108.69-79.45s94.03 33.38 108.69 79.45c6.02 18.94 23.29 32.03 43.16 32.03h78.53c42.93 0 77.81-35.17 74.44-77.97ZM305.04 409.68c-37.82 0-71.03-19.68-90-49.33v138.97c0 49.5 40.5 90 90 90s90-40.5 90-90V360.35c-18.98 29.66-52.18 49.33-90 49.33Z" />
			<circle cx="305.04" cy="90.37" r="90.37" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			className="text-tw-success shrink-0"
		>
			<path
				d="M2.5 6L5 8.5L9.5 3.5"
				stroke="currentColor"
				strokeWidth="1.5"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
