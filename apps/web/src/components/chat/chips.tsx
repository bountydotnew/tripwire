import type { ReactNode } from "react";

export function UserMentionChip({ username }: { username: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-md px-1 py-[1.5px] bg-[#212328] border border-[#2B303B] shadow-[0_0_8px_rgba(59,130,246,0.15)]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<img
				src={`https://github.com/${username}.png?size=28`}
				alt=""
				className="w-3.5 h-3.5 rounded-full bg-[#3a3a3e] ring-1 ring-white/10"
			/>
			<span className="text-[12px] leading-tight text-blue-200 font-medium px-0.5">
				{username}
			</span>
		</span>
	);
}

export function IssueChip({ label, number }: { label: string | null; number: string }) {
	return (
		<span
			className="inline-flex items-center gap-1 rounded-[5px] px-1 py-[1px] bg-[#2A2A2A]"
			style={{ verticalAlign: "-0.2em" }}
		>
			<svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="shrink-0">
				<circle cx="8" cy="8" r="5.5" stroke="#B4B4B4" strokeWidth="1.2" />
				<circle cx="8" cy="8" r="1.5" fill="#B4B4B4" />
			</svg>
			<span className="text-[12px] leading-tight text-[#FAFAFA] font-medium tabular-nums">
				{label ? `${label} ` : ""}#{number}
			</span>
		</span>
	);
}

export function renderInlineText(text: string): ReactNode {
	if (!text) return text;
	const regex = /(@[A-Za-z0-9][A-Za-z0-9_-]*)|((?:PR|Issue|issue)\s+#\d+)|(#\d+)/g;
	const parts: ReactNode[] = [];
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
			const label = rawLabel ? (rawLabel.toLowerCase() === "issue" ? "Issue" : "PR") : null;
			parts.push(<IssueChip key={`i${key++}`} label={label} number={mm?.[2] || ""} />);
		}
		lastIndex = regex.lastIndex;
	}
	if (lastIndex < text.length) parts.push(text.slice(lastIndex));
	return parts;
}

export function getBriefActionText(action: string, username?: string): ReactNode {
	const user = username ? <>{renderInlineText(`@${username}`)}</> : "user";
	switch (action) {
		case "add_to_blacklist":
			return <>Blacklist {user}</>;
		case "remove_from_blacklist":
			return <>Remove {user} from blacklist</>;
		case "add_to_whitelist":
			return <>Whitelist {user}</>;
		case "remove_from_whitelist":
			return <>Remove {user} from whitelist</>;
		case "move_to_whitelist":
			return <>Move {user} to whitelist</>;
		case "move_to_blacklist":
			return <>Move {user} to blacklist</>;
		default:
			return <>{action.replace(/_/g, " ")} {user}</>;
	}
}
