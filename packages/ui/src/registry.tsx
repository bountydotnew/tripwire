import { defineRegistry, Renderer, JSONUIProvider } from "@json-render/react";
import { useState } from "react";
import type { RenderSpec } from "./types";
import { catalog } from "./catalog";

/**
 * Component Registry for AI tool results
 * Maps catalog components to styled React implementations
 */

/** Format large numbers compactly: 1200 → "1.2K", 1500000 → "1.5M" */
function fmtCompact(n: number): string {
	if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
	return String(n);
}

/** Lightweight markdown-to-JSX for tool card bodies (no deps). */
function MiniMarkdown({ content }: { content: string }) {
	const lines = content.split("\n");
	const elements: React.ReactNode[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed) { elements.push(<br key={i} />); continue; }

		// Block quote
		if (trimmed.startsWith("> ")) {
			elements.push(
				<div key={i} className="border-l-2 border-tw-border pl-2 text-tw-text-muted italic">
					<InlineMarkdown text={trimmed.slice(2)} />
				</div>
			);
			continue;
		}

		// Heading
		const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const cls = level === 1 ? "text-[12px] font-semibold text-tw-text-primary" : "text-[11px] font-medium text-tw-text-secondary";
			elements.push(<div key={i} className={cls}><InlineMarkdown text={headingMatch[2]} /></div>);
			continue;
		}

		// List item
		if (trimmed.match(/^[-*]\s/)) {
			elements.push(
				<div key={i} className="flex gap-1.5 items-start">
					<span className="text-tw-text-muted mt-px shrink-0">·</span>
					<span><InlineMarkdown text={trimmed.replace(/^[-*]\s/, "")} /></span>
				</div>
			);
			continue;
		}

		// Code block markers
		if (trimmed.startsWith("```")) {
			// Collect lines until closing ```
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			elements.push(
				<pre key={i} className="text-[10px] font-mono bg-[#FAFAFA08] rounded-md px-2 py-1.5 overflow-x-auto whitespace-pre-wrap">
					{codeLines.join("\n")}
				</pre>
			);
			continue;
		}

		// Normal paragraph
		elements.push(<div key={i}><InlineMarkdown text={trimmed} /></div>);
	}

	return <div className="flex flex-col gap-0.5">{elements}</div>;
}

/** Handles inline markdown: **bold**, `code`, [links](url) */
function InlineMarkdown({ text }: { text: string }) {
	const parts: React.ReactNode[] = [];
	// Process inline patterns
	const regex = /(\*\*(.+?)\*\*|`(.+?)`|\[(.+?)\]\((.+?)\))/g;
	let lastIndex = 0;
	let match;

	while ((match = regex.exec(text)) !== null) {
		// Text before match
		if (match.index > lastIndex) {
			parts.push(text.slice(lastIndex, match.index));
		}
		if (match[2]) {
			// Bold
			parts.push(<strong key={match.index} className="font-medium text-tw-text-primary">{match[2]}</strong>);
		} else if (match[3]) {
			// Inline code
			parts.push(<code key={match.index} className="text-[10px] font-mono bg-[#FAFAFA10] px-1 py-px rounded">{match[3]}</code>);
		} else if (match[4] && match[5]) {
			// Link
			parts.push(<a key={match.index} href={match[5]} target="_blank" rel="noopener noreferrer" className="text-tw-accent hover:underline">{match[4]}</a>);
		}
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < text.length) {
		parts.push(text.slice(lastIndex));
	}

	return <>{parts}</>;
}

export const { registry } = defineRegistry(catalog, {
	components: {
		// ─── User Profile Card ────────────────────────────────────────
		UserCard: ({ props }) => {
			const statusColor =
				props.status === "blacklisted"
					? "text-tw-error"
					: props.status === "whitelisted"
						? "text-tw-success"
						: "text-tw-text-muted";

			const statusLabel =
				props.status === "blacklisted"
					? "Blacklisted"
					: props.status === "whitelisted"
						? "Whitelisted"
						: "Normal";

			const scoreColor =
				props.contributorScore >= 60
					? "text-tw-success"
					: props.contributorScore >= 30
						? "text-tw-warning"
						: "text-tw-error";

			const ageDays = props.accountAgeDays;
			const ageText =
				ageDays >= 365
					? `${Math.floor(ageDays / 365)}y ${Math.floor((ageDays % 365) / 30)}mo`
					: ageDays >= 30
						? `${Math.floor(ageDays / 30)}mo`
						: `${ageDays}d`;

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2.5">
					{/* Header: avatar, name, score */}
					<div className="flex items-center gap-2.5">
						{props.avatar && (
							<a href={`/users/${props.username}`}>
								<img src={props.avatar} alt="" className="size-10 rounded-full hover:opacity-80 transition-opacity" />
							</a>
						)}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<a href={`/users/${props.username}`} className="text-[14px] text-tw-text-primary font-medium hover:text-tw-accent transition-colors">@{props.username}</a>
								<span className={`text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
							</div>
							{(props.name || props.company) && (
								<div className="text-[12px] text-tw-text-muted truncate">
									{props.name}{props.company ? ` · ${props.company}` : ""}
								</div>
							)}
						</div>
						<div className="flex flex-col items-center shrink-0">
							<span className={`text-[18px] font-semibold tabular-nums ${scoreColor}`}>
								{props.contributorScore}
							</span>
							<span className="text-[9px] text-tw-text-muted uppercase tracking-wider">score</span>
						</div>
					</div>

					{/* Bio */}
					{props.bio && (
						<div className="text-[12px] text-tw-text-secondary leading-relaxed">{props.bio}</div>
					)}

					{/* Stats grid */}
					<div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[11px]">
						<div><span className="text-tw-text-muted">Account age </span><span className="text-tw-text-secondary">{ageText}</span></div>
						<div><span className="text-tw-text-muted">Public repos </span><span className="text-tw-text-secondary">{fmtCompact(props.publicRepos)}</span></div>
						<div><span className="text-tw-text-muted">Followers </span><span className="text-tw-text-secondary">{fmtCompact(props.followers)}</span></div>
						<div className="col-span-3">
							<span className="text-tw-text-muted">Breakdown </span>
							<span className="text-tw-text-secondary">
								Non-fork public: {fmtCompact(props.publicNonForkRepos)}
								<span className="text-tw-text-muted"> · </span>
								Forks: {fmtCompact(props.publicForkRepos)}
								<span className="text-tw-text-muted"> · </span>
								PRs here: {fmtCompact(props.prsToThisRepo)}
							</span>
						</div>
						<div className="col-span-3">
							<span className="text-tw-text-muted">PRs </span>
							<span className="text-tw-text-secondary">
								{fmtCompact(props.closedPrs)} closed: {fmtCompact(props.mergedPrs)} merged, {fmtCompact(props.closedUnmergedPrs)} not merged
							</span>
						</div>
						<div><span className="text-tw-text-muted">Contributions </span><span className="text-tw-text-secondary">{fmtCompact(props.contributionsLastYear)}</span></div>
						<div><span className="text-tw-text-muted">Following </span><span className="text-tw-text-secondary">{fmtCompact(props.following)}</span></div>
					</div>

					{/* Event breakdown */}
					{(props.blockedCount > 0 || props.allowedCount > 0 || props.nearMissCount > 0) && (
						<div className="flex items-center gap-3 text-[11px]">
							<span className="text-tw-text-muted">Events:</span>
							{props.allowedCount > 0 && <span className="text-tw-success">{fmtCompact(props.allowedCount)} allowed</span>}
							{props.blockedCount > 0 && <span className="text-tw-error">{fmtCompact(props.blockedCount)} blocked</span>}
							{props.nearMissCount > 0 && <span className="text-tw-warning">{fmtCompact(props.nearMissCount)} near-miss</span>}
						</div>
					)}

					{/* Badges + Achievements */}
					{(props.badges.length > 0 || props.achievements.length > 0) && (
						<div className="flex flex-wrap gap-1">
							{props.badges.map((badge) => (
								<span key={badge} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FAFAFA08] text-tw-text-muted">{badge}</span>
							))}
							{props.achievements.map((a) => (
								<span key={a.type} className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#FAFAFA08] text-tw-text-secondary">
									{a.type}{a.tier > 1 ? ` x${a.tier}` : ""}
								</span>
							))}
						</div>
					)}

					{/* Orgs */}
					{props.orgs.length > 0 && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-tw-text-muted shrink-0">Orgs</span>
							{props.orgs.slice(0, 6).map((org) => (
								<img key={org.login} src={org.avatarUrl} alt={org.login} title={org.login} className="size-5 rounded-sm" />
							))}
							{props.orgs.length > 6 && <span className="text-[10px] text-tw-text-muted">+{props.orgs.length - 6}</span>}
						</div>
					)}

					{/* Sponsors + signals */}
					<div className="flex flex-wrap gap-2 text-[10px] text-tw-text-muted">
						{props.sponsorsCount > 0 && <span>{fmtCompact(props.sponsorsCount)} sponsor{props.sponsorsCount !== 1 ? "s" : ""}</span>}
						{props.sponsoringCount > 0 && <span>sponsoring {fmtCompact(props.sponsoringCount)}</span>}
						{props.hasTwoFactor && <span className="text-tw-success">2FA</span>}
						{props.hasProfileReadme && <span>README</span>}
					</div>

					{/* Score breakdown affordance */}
					<ScoreBreakdownButton username={props.username} />
				</div>
			);
		},

		// ─── Events List ──────────────────────────────────────────────
		EventsList: ({ props }) => {
			if (props.events.length === 0) {
				return (
					<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
						No events found.
					</div>
				);
			}

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					{props.title && (
						<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
							{props.title}
						</div>
					)}
					<div className="space-y-1.5">
						{props.events.slice(0, 5).map((event) => (
							<div key={event.id} className="flex items-center gap-2 text-[12px]">
								<span
									className={`size-1.5 rounded-full ${
										event.severity === "error"
											? "bg-tw-error"
											: event.severity === "warning"
												? "bg-tw-warning"
												: "bg-tw-text-muted"
									}`}
								/>
								<span className="text-tw-text-secondary truncate flex-1">
									{event.description}
								</span>
								{event.username && (
									<span className="text-tw-text-muted shrink-0">
										@{event.username}
									</span>
								)}
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Single Event Card ────────────────────────────────────────
		EventCard: ({ props }) => {
			const severityColor =
				props.severity === "error"
					? "border-tw-error/20 bg-[#F56D5D0D]"
					: props.severity === "warning"
						? "border-tw-warning/20 bg-[#F5A6230D]"
						: "border-tw-text-muted/20 bg-tw-card";

			const dotColor =
				props.severity === "error"
					? "bg-tw-error"
					: props.severity === "warning"
						? "bg-tw-warning"
						: "bg-tw-text-muted";

			return (
				<div className={`rounded-xl border p-3 flex flex-col gap-2 ${severityColor}`}>
					<div className="flex items-start gap-2">
						<span className={`size-2 rounded-full mt-1.5 shrink-0 ${dotColor}`} />
						<div className="flex-1 min-w-0">
							<div className="text-[13px] text-tw-text-primary font-medium">
								{props.action}
							</div>
							<div className="text-[12px] text-tw-text-secondary mt-0.5">
								{props.description}
							</div>
						</div>
					</div>
					<div className="flex items-center justify-between text-[11px] text-tw-text-muted">
						<span>{props.date}</span>
						{props.username && <span>@{props.username}</span>}
					</div>
				</div>
			);
		},

		// ─── Action Result ────────────────────────────────────────────
		ActionResult: ({ props }) => {
			const bgColor = props.success
				? "bg-[#4ADE801A] border-tw-success/20"
				: "bg-[#F56D5D1A] border-tw-error/20";

			const iconColor = props.success ? "text-tw-success" : "text-tw-error";

			return (
				<div className={`rounded-xl border p-3 flex items-center gap-2 ${bgColor}`}>
					{props.success ? (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							className={iconColor}
						>
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path
								d="M4 7L6 9L10 5"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					) : (
						<svg
							width="14"
							height="14"
							viewBox="0 0 14 14"
							fill="none"
							className={iconColor}
						>
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path
								d="M5 5L9 9M9 5L5 9"
								stroke="currentColor"
								strokeWidth="1.2"
								strokeLinecap="round"
							/>
						</svg>
					)}
					<span className="text-[13px] text-tw-text-primary">{props.message}</span>
				</div>
			);
		},

		// ─── Lists Overview ───────────────────────────────────────────
		ListsOverview: ({ props }) => {
			const hasBlacklist = props.blacklist.length > 0;
			const hasWhitelist = props.whitelist.length > 0;

			if (!hasBlacklist && !hasWhitelist) {
				return (
					<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
						No users on either list.
					</div>
				);
			}

			return (
				<div className="flex flex-col gap-3">
					{/* Blacklist */}
					{hasBlacklist && (
						<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
							<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted uppercase tracking-wider">
								<svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-tw-error">
									<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
									<path d="M4 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
								</svg>
								Blacklist
							</div>
							<div className="space-y-1.5">
								{props.blacklist.map((user) => (
									<div key={user.username} className="flex items-center gap-2 text-[12px]">
										{user.avatar && (
											<img src={user.avatar} alt="" className="size-5 rounded-full" />
										)}
										<span className="text-tw-text-primary font-medium">@{user.username}</span>
										<span className="text-tw-text-muted ml-auto">{user.addedAt}</span>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Whitelist */}
					{hasWhitelist && (
						<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
							<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted uppercase tracking-wider">
								<svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-tw-success">
									<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
									<path d="M4 7L6 9L10 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
								Whitelist
							</div>
							<div className="space-y-1.5">
								{props.whitelist.map((user) => (
									<div key={user.username} className="flex items-center gap-2 text-[12px]">
										{user.avatar && (
											<img src={user.avatar} alt="" className="size-5 rounded-full" />
										)}
										<span className="text-tw-text-primary font-medium">@{user.username}</span>
										<span className="text-tw-text-muted ml-auto">{user.addedAt}</span>
									</div>
								))}
							</div>
						</div>
					)}
				</div>
			);
		},

		// ─── Score Breakdown ──────────────────────────────────────────
		ScoreBreakdown: ({ props }) => {
			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-3">
					<div className="flex items-baseline justify-between">
						<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted tracking-wider">
							@{props.username}
						</div>
						<div className="text-[20px] font-semibold text-tw-text-primary">
							{props.total}
							<span className="text-[12px] text-tw-text-muted ml-1">/ 100</span>
						</div>
					</div>

					<div className="flex flex-col gap-2.5">
						{props.categories.map((cat) => (
							<div key={cat.id} className="flex flex-col gap-1">
								<div className="flex items-baseline justify-between text-[12px]">
									<span className="text-tw-text-secondary font-medium">{cat.label}</span>
									<span className={cat.subtotal < 0 ? "text-tw-error" : "text-tw-text-primary"}>
										{cat.subtotal > 0 ? "+" : ""}
										{cat.subtotal}
										{cat.max != null && (
											<span className="text-tw-text-muted ml-1">/ {cat.max}</span>
										)}
									</span>
								</div>
								{cat.items.length === 0 ? (
									<div className="text-[11px] text-tw-text-muted pl-2">No contributing factors.</div>
								) : (
									<div className="flex flex-col gap-0.5 pl-2">
										{cat.items.map((item, i) => (
											<div
												key={`${cat.id}-${i}`}
												className="flex items-baseline justify-between text-[11px] gap-2"
											>
												<span className="text-tw-text-secondary">{item.reason}</span>
												<span
													className={
														item.delta < 0
															? "text-tw-error tabular-nums"
															: "text-tw-success tabular-nums"
													}
												>
													{item.delta > 0 ? "+" : ""}
													{item.delta}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Reputation Leaderboard ───────────────────────────────────
		ReputationLeaderboard: ({ props }) => {
			if (props.users.length === 0) {
				return (
					<div className="rounded-xl bg-tw-card p-3 text-[13px] text-tw-text-secondary">
						No blocked users yet.
					</div>
				);
			}

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted uppercase tracking-wider">
						<svg width="10" height="10" viewBox="0 0 14 14" fill="none" className="text-tw-error">
							<circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
							<path d="M4 7h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
						</svg>
						Most Blocked Users
					</div>
					<div className="space-y-1.5">
						{props.users.map((user, i) => (
							<div key={user.username} className="flex items-center gap-2 text-[12px]">
								<span className="text-tw-text-muted w-4 text-right shrink-0">{i + 1}.</span>
								<span className="text-tw-text-primary font-medium">@{user.username}</span>
								<span className="text-tw-error">{user.totalBlocks} blocked</span>
								{user.totalAllows > 0 && <span className="text-tw-success">{user.totalAllows} allowed</span>}
								{user.totalNearMisses > 0 && <span className="text-tw-warning">{user.totalNearMisses} near-miss</span>}
								<span className="ml-auto text-tw-text-muted">{user.lastSeenAt}</span>
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Lists Status ─────────────────────────────────────────────
		ListsStatus: ({ props }) => {
			const status = props.isBlacklisted
				? "blacklisted"
				: props.isWhitelisted
					? "whitelisted"
					: "normal";

			const statusText =
				status === "blacklisted"
					? "Blacklisted"
					: status === "whitelisted"
						? "Whitelisted"
						: "Not on any list";

			const statusColor =
				status === "blacklisted"
					? "text-tw-error"
					: status === "whitelisted"
						? "text-tw-success"
						: "text-tw-text-muted";

			const reason = props.isBlacklisted
				? props.blacklistReason
				: props.isWhitelisted
					? props.whitelistReason
					: null;

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-1">
					<div className="flex items-center justify-between">
						<span className="text-[12px] text-tw-text-muted">
							@{props.username}
						</span>
						<span className={`text-[12px] font-medium ${statusColor}`}>
							{statusText}
						</span>
					</div>
					{reason && (
						<div className="text-[11px] text-tw-text-secondary">{reason}</div>
					)}
				</div>
			);
		},

		// ─── Rule Config Card ─────────────────────────────────────────
		RuleConfigCard: ({ props }) => {
			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-center justify-between">
						<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
							Rule Configuration
						</div>
						<span className="text-[11px] text-tw-text-muted">
							{props.enabledCount} / {props.totalCount} active
						</span>
					</div>
					<div className="space-y-1">
						{props.rules.map((rule) => (
							<div key={rule.id} className="flex items-center justify-between py-1">
								<div className="flex items-center gap-2 min-w-0">
									<span
										className={`size-1.5 rounded-full shrink-0 ${
											rule.enabled ? "bg-tw-success" : "bg-tw-text-muted/30"
										}`}
									/>
									<span className={`text-[12px] ${rule.enabled ? "text-tw-text-primary" : "text-tw-text-muted"}`}>
										{rule.name}
									</span>
								</div>
								<div className="flex items-center gap-2 shrink-0">
									{rule.detail && (
										<span className="text-[11px] text-tw-text-muted">{rule.detail}</span>
									)}
									{rule.enabled && (
										<span className={`text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded ${
											rule.action === "block" ? "bg-red-500/10 text-red-400"
												: rule.action === "warn" ? "bg-amber-500/10 text-amber-400"
													: rule.action === "log" ? "bg-blue-500/10 text-blue-400"
														: "bg-purple-500/10 text-purple-400"
										}`}>
											{rule.action}
										</span>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Pull Request List ────────────────────────────────────────
		PullRequestList: ({ props }) => {
			const [expanded, setExpanded] = useState<number | null>(null);

			function relativeDate(iso: string) {
				const d = Date.now() - new Date(iso).getTime();
				const days = Math.floor(d / 86_400_000);
				if (days === 0) return "today";
				if (days === 1) return "yesterday";
				if (days < 30) return `${days}d ago`;
				if (days < 365) return `${Math.floor(days / 30)}mo ago`;
				return `${Math.floor(days / 365)}y ago`;
			}

			function formatMergeTime(minutes: number | null) {
				if (minutes == null) return null;
				if (minutes < 60) return `${minutes}m`;
				if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
				return `${Math.round(minutes / 1440)}d`;
			}

			const stateColor: Record<string, string> = {
				merged: "bg-[#A371F7]",
				closed: "bg-tw-error",
				open: "bg-tw-success",
			};

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-baseline justify-between">
						<div className="text-[12px] text-tw-text-muted">
							@{props.username} Pull Requests
						</div>
						<span className="text-[11px] text-tw-text-muted tabular-nums">
							{props.showing} of {props.totalCount}
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						{props.prs.map((pr, i) => (
							<div key={pr.number}>
								<button
									type="button"
									onClick={() => setExpanded(expanded === i ? null : i)}
									className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#ffffff08] transition-colors text-left"
								>
									<span className={`size-1.5 rounded-full shrink-0 ${stateColor[pr.state] ?? "bg-tw-text-muted"}`} />
									<span className="text-[12px] text-tw-text-primary truncate flex-1">
										{pr.title}
									</span>
									<span className="text-[10px] text-tw-text-muted shrink-0 tabular-nums">#{pr.number}</span>
									{/* Diff stats inline */}
									{(pr.additions > 0 || pr.deletions > 0) && (
										<span className="flex items-center gap-1 text-[10px] shrink-0 tabular-nums">
											<span className="text-tw-success">+{pr.additions}</span>
											<span className="text-tw-error">-{pr.deletions}</span>
										</span>
									)}
									<span className="text-[10px] text-tw-text-muted shrink-0 tabular-nums">
										{relativeDate(pr.mergedAt ?? pr.createdAt)}
									</span>
								</button>
								{expanded === i && (
									<div className="ml-5 pb-2 pt-0.5 flex flex-col gap-1.5">
										{/* Repo + PR meta */}
										<div className="flex items-center gap-2 text-[11px] text-tw-text-muted flex-wrap">
											<span>{pr.repo}</span>
											<span>#{pr.number}</span>
											<span className="capitalize">{pr.state}</span>
										</div>

										{/* Stats row */}
										<div className="flex items-center gap-3 text-[11px]">
											{pr.changedFiles > 0 && (
												<span className="text-tw-text-secondary">{pr.changedFiles} file{pr.changedFiles !== 1 ? "s" : ""}</span>
											)}
											{pr.commits > 0 && (
												<span className="text-tw-text-secondary">{pr.commits} commit{pr.commits !== 1 ? "s" : ""}</span>
											)}
											{pr.timeToMergeMinutes != null && (
												<span className="text-tw-text-muted">merged in {formatMergeTime(pr.timeToMergeMinutes)}</span>
											)}
										</div>

										{/* Diff bar */}
										{(pr.additions > 0 || pr.deletions > 0) && (
											<div className="flex items-center gap-2">
												<div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-tw-surface gap-px">
													<div className="h-full bg-tw-success rounded-full" style={{ width: `${(pr.additions / (pr.additions + pr.deletions)) * 100}%` }} />
													<div className="h-full bg-tw-error rounded-full" style={{ width: `${(pr.deletions / (pr.additions + pr.deletions)) * 100}%` }} />
												</div>
												<span className="text-[10px] text-tw-text-muted tabular-nums shrink-0">
													+{pr.additions} / -{pr.deletions}
												</span>
											</div>
										)}

										{/* Labels */}
										{pr.labels.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{pr.labels.map((l) => (
													<span
														key={l.name}
														className="text-[9px] px-1.5 py-px rounded-full"
														style={{ backgroundColor: `#${l.color}30`, color: `#${l.color}` }}
													>
														{l.name}
													</span>
												))}
											</div>
										)}

										{/* Timestamps */}
										<div className="flex items-center gap-3 text-[10px] text-tw-text-muted">
											<span>Opened {relativeDate(pr.createdAt)}</span>
											{pr.mergedAt && <span>Merged {relativeDate(pr.mergedAt)}</span>}
										</div>

										<a
											href={pr.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-[11px] text-tw-accent hover:underline self-start"
										>
											View on GitHub
										</a>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Single PR Detail ─────────────────────────────────────────
		PullRequestDetail: ({ props }) => {
			const [showFiles, setShowFiles] = useState(false);
			const [showCommits, setShowCommits] = useState(false);
			const [showComments, setShowComments] = useState(false);

			function relativeDate(iso: string) {
				const d = Date.now() - new Date(iso).getTime();
				const days = Math.floor(d / 86_400_000);
				if (days === 0) return "today";
				if (days === 1) return "yesterday";
				if (days < 30) return `${days}d ago`;
				if (days < 365) return `${Math.floor(days / 30)}mo ago`;
				return `${Math.floor(days / 365)}y ago`;
			}

			function formatMergeTime(minutes: number | null) {
				if (minutes == null) return null;
				if (minutes < 60) return `${minutes}m`;
				if (minutes < 1440) return `${Math.round(minutes / 60)}h`;
				return `${Math.round(minutes / 1440)}d`;
			}

			const stateColors: Record<string, string> = {
				merged: "bg-[#A371F7]/10 text-[#A371F7]",
				closed: "bg-tw-error/10 text-tw-error",
				open: "bg-tw-success/10 text-tw-success",
			};

			const reviewStateColors: Record<string, string> = {
				APPROVED: "text-tw-success",
				CHANGES_REQUESTED: "text-tw-error",
				COMMENTED: "text-tw-text-muted",
				PENDING: "text-tw-text-muted",
				DISMISSED: "text-tw-text-muted",
			};

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2.5">
					{/* Header */}
					<div className="flex items-start gap-2.5">
						{props.authorAvatar && (
							<img src={props.authorAvatar} alt="" className="size-8 rounded-full mt-0.5" />
						)}
						<div className="flex-1 min-w-0">
							<div className="text-[13px] text-tw-text-primary font-medium leading-snug">
								{props.title}
							</div>
							<div className="flex items-center gap-2 mt-0.5 text-[11px] text-tw-text-muted flex-wrap">
								<span>{props.repo}</span>
								<span>#{props.number}</span>
								<span>by @{props.author}</span>
								<span className={`px-1.5 py-px rounded-full text-[10px] font-medium capitalize ${stateColors[props.state] ?? "bg-tw-text-muted/10 text-tw-text-muted"}`}>
									{props.draft ? "draft" : props.state}
								</span>
								{props.closedBy && (
									<span className="text-tw-text-muted">
										{props.selfClosed ? "self-closed" : `by @${props.closedBy}`}
									</span>
								)}
							</div>
						</div>
					</div>

					{/* Diff bar + stats */}
					<div className="flex flex-col gap-1.5">
						<div className="flex items-center gap-3 text-[11px]">
							<span className="text-tw-success tabular-nums">+{props.additions}</span>
							<span className="text-tw-error tabular-nums">-{props.deletions}</span>
							<span className="text-tw-text-secondary">{props.changedFiles} file{props.changedFiles !== 1 ? "s" : ""}</span>
							<span className="text-tw-text-secondary">{props.commits} commit{props.commits !== 1 ? "s" : ""}</span>
							{props.timeToMergeMinutes != null && (
								<span className="text-tw-text-muted">merged in {formatMergeTime(props.timeToMergeMinutes)}</span>
							)}
						</div>
						{(props.additions > 0 || props.deletions > 0) && (
							<div className="flex h-1.5 rounded-full overflow-hidden bg-tw-surface gap-px">
								<div className="h-full bg-tw-success rounded-full" style={{ width: `${(props.additions / (props.additions + props.deletions)) * 100}%` }} />
								<div className="h-full bg-tw-error rounded-full" style={{ width: `${(props.deletions / (props.additions + props.deletions)) * 100}%` }} />
							</div>
						)}
					</div>

					{/* Timestamps */}
					<div className="flex items-center gap-3 text-[10px] text-tw-text-muted">
						<span>Opened {relativeDate(props.createdAt)}</span>
						{props.mergedAt && <span>Merged {relativeDate(props.mergedAt)}</span>}
					</div>

					{/* Labels */}
					{props.labels.length > 0 && (
						<div className="flex flex-wrap gap-1">
							{props.labels.map((l) => (
								<span
									key={l.name}
									className="text-[9px] px-1.5 py-px rounded-full"
									style={{ backgroundColor: `#${l.color}30`, color: `#${l.color}` }}
								>
									{l.name}
								</span>
							))}
						</div>
					)}

					{/* Reviewers */}
					{props.reviewers.length > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-[10px] text-tw-text-muted shrink-0">Reviews</span>
							{props.reviewers.map((r) => (
								<span key={r.login} className="flex items-center gap-1 text-[11px]">
									<img src={r.avatarUrl} alt="" className="size-4 rounded-full" />
									<span className="text-tw-text-secondary">@{r.login}</span>
									<span className={`text-[10px] ${reviewStateColors[r.state] ?? "text-tw-text-muted"}`}>
										{r.state === "APPROVED" ? "approved" : r.state === "CHANGES_REQUESTED" ? "changes" : r.state.toLowerCase()}
									</span>
								</span>
							))}
						</div>
					)}

					{/* Body snippet */}
					{props.body && (
						<div className="text-[11px] text-tw-text-secondary leading-relaxed bg-[#FAFAFA06] rounded-lg p-2 max-h-32 overflow-auto">
							<MiniMarkdown content={props.body} />
						</div>
					)}

					{/* Files toggle */}
					{props.files.length > 0 && (
						<div>
							<button
								type="button"
								onClick={() => setShowFiles(!showFiles)}
								className="text-[11px] text-tw-text-muted hover:text-tw-text-secondary transition-colors"
							>
								{showFiles ? "Hide" : "Show"} {props.files.length} file{props.files.length !== 1 ? "s" : ""}
							</button>
							{showFiles && (
								<div className="mt-1 flex flex-col gap-0.5 max-h-48 overflow-auto">
									{props.files.map((f) => (
										<div key={f.filename} className="flex items-center gap-2 text-[10px] py-0.5 px-1 rounded hover:bg-[#ffffff04]">
											<span className="text-tw-success tabular-nums">+{f.additions}</span>
											<span className="text-tw-error tabular-nums">-{f.deletions}</span>
											<span className="text-tw-text-secondary truncate flex-1 font-mono">{f.filename}</span>
											<span className="text-tw-text-muted capitalize shrink-0">{f.status}</span>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Commits toggle */}
					{props.commitMessages.length > 0 && (
						<div>
							<button
								type="button"
								onClick={() => setShowCommits(!showCommits)}
								className="text-[11px] text-tw-text-muted hover:text-tw-text-secondary transition-colors"
							>
								{showCommits ? "Hide" : "Show"} {props.commitMessages.length} commit{props.commitMessages.length !== 1 ? "s" : ""}
							</button>
							{showCommits && (
								<div className="mt-1 flex flex-col gap-0.5 max-h-36 overflow-auto">
									{props.commitMessages.map((msg, i) => (
										<div key={i} className="text-[10px] text-tw-text-secondary py-0.5 px-1 rounded hover:bg-[#ffffff04] font-mono truncate">
											{msg}
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Comments thread */}
					{props.comments.length > 0 && (
						<div>
							<button
								type="button"
								onClick={() => setShowComments(!showComments)}
								className="text-[11px] text-tw-text-muted hover:text-tw-text-secondary transition-colors"
							>
								{showComments ? "Hide" : "Show"} {props.comments.length} comment{props.comments.length !== 1 ? "s" : ""}
							</button>
							{showComments && (
								<div className="mt-1.5 flex flex-col gap-2 max-h-72 overflow-auto">
									{props.comments.map((c, i) => (
										<div key={i} className="flex gap-2">
											<img src={c.authorAvatar} alt="" className="size-5 rounded-full mt-0.5 shrink-0" />
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-1.5 text-[10px]">
													<span className="text-tw-text-secondary font-medium">@{c.author}</span>
													{c.type === "review" && <span className="text-tw-text-muted">review</span>}
													<span className="text-tw-text-muted">{relativeDate(c.createdAt)}</span>
												</div>
												<div className="text-[11px] text-tw-text-secondary leading-relaxed mt-0.5">
													<MiniMarkdown content={c.body} />
												</div>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					<a
						href={props.url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-[11px] text-tw-accent hover:underline self-start"
					>
						View on GitHub
					</a>
				</div>
			);
		},

		// ─── Comment Thread ───────────────────────────────────────────
		CommentThread: ({ props }) => {
			function relDate(iso: string) {
				const d = Date.now() - new Date(iso).getTime();
				const days = Math.floor(d / 86_400_000);
				if (days === 0) return "today";
				if (days === 1) return "yesterday";
				if (days < 30) return `${days}d ago`;
				if (days < 365) return `${Math.floor(days / 30)}mo ago`;
				return `${Math.floor(days / 365)}y ago`;
			}

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-baseline justify-between">
						<div className="text-[12px] text-tw-text-muted">
							{props.repo} #{props.issueNumber}
						</div>
						<span className="text-[11px] text-tw-text-muted tabular-nums">
							{props.totalCount} comment{props.totalCount !== 1 ? "s" : ""}
						</span>
					</div>
					<div className="flex flex-col gap-2.5">
						{props.comments.map((c, i) => (
							<div key={i} className="flex gap-2">
								<img src={c.authorAvatar} alt="" className="size-5 rounded-full mt-0.5 shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-1.5 text-[10px]">
										<span className="text-tw-text-secondary font-medium">@{c.author}</span>
										{c.type === "review" && (
											<span className="px-1 py-px rounded bg-[#FAFAFA08] text-tw-text-muted text-[9px]">review</span>
										)}
										<span className="text-tw-text-muted">{relDate(c.createdAt)}</span>
									</div>
									<div className="text-[11px] text-tw-text-secondary leading-relaxed mt-0.5">
										<MiniMarkdown content={c.body} />
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Repository List ──────────────────────────────────────────
		RepoList: ({ props }) => {
			const [expanded, setExpanded] = useState<number | null>(null);

			const langColors: Record<string, string> = {
				TypeScript: "#3178C6", JavaScript: "#F7DF1E", Python: "#3776AB",
				Go: "#00ADD8", Rust: "#DEA584", Java: "#B07219", Ruby: "#CC342D",
				C: "#555555", "C++": "#F34B7D", "C#": "#239120", Swift: "#F05138",
				Kotlin: "#A97BFF", PHP: "#4F5D95", Shell: "#89E051", Lua: "#000080",
			};

			function relativeDate(iso: string) {
				const d = Date.now() - new Date(iso).getTime();
				const days = Math.floor(d / 86_400_000);
				if (days === 0) return "today";
				if (days === 1) return "yesterday";
				if (days < 30) return `${days}d ago`;
				if (days < 365) return `${Math.floor(days / 30)}mo ago`;
				return `${Math.floor(days / 365)}y ago`;
			}

			function fmtDate(iso: string) {
				return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
			}

			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
					<div className="flex items-baseline justify-between">
						<div className="text-[12px] text-tw-text-muted">
							@{props.username} Repositories
						</div>
						<span className="text-[11px] text-tw-text-muted tabular-nums">
							{props.showing} of {props.totalCount}
						</span>
					</div>
					<div className="flex flex-col gap-0.5">
						{props.repos.map((repo, i) => (
							<div key={repo.fullName}>
								<button
									type="button"
									onClick={() => setExpanded(expanded === i ? null : i)}
									className="w-full flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-[#ffffff08] transition-colors text-left"
								>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-1.5">
											<span className="text-[12px] text-tw-text-primary font-medium truncate">{repo.name}</span>
											{repo.isFork && (
												<span className="text-[9px] px-1 py-px rounded bg-[#FAFAFA08] text-tw-text-muted">fork</span>
											)}
											{repo.archived && (
												<span className="text-[9px] px-1 py-px rounded bg-tw-warning/10 text-tw-warning">archived</span>
											)}
										</div>
										{repo.description && (
											<div className="text-[11px] text-tw-text-muted truncate">{repo.description}</div>
										)}
									</div>
									<div className="flex items-center gap-2 shrink-0 text-[11px]">
										{repo.language && (
											<span className="flex items-center gap-1 text-tw-text-muted">
												<span className="size-2 rounded-full" style={{ background: langColors[repo.language] ?? "#9F9FA9" }} />
												{repo.language}
											</span>
										)}
										{repo.stars > 0 && (
											<span className="text-tw-text-muted tabular-nums">{fmtCompact(repo.stars)}</span>
										)}
									</div>
								</button>
								{expanded === i && (
									<div className="ml-4 pb-2 pt-0.5 flex flex-col gap-1.5">
										<div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px] text-tw-text-muted">
											<span>Created {fmtDate(repo.createdAt)}</span>
											<span>Updated {relativeDate(repo.updatedAt)}</span>
											{repo.pushedAt && <span>Pushed {relativeDate(repo.pushedAt)}</span>}
										</div>
										<div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-[11px]">
											{repo.stars > 0 && <span className="text-tw-text-secondary">{fmtCompact(repo.stars)} star{repo.stars !== 1 ? "s" : ""}</span>}
											{repo.forks > 0 && <span className="text-tw-text-secondary">{fmtCompact(repo.forks)} fork{repo.forks !== 1 ? "s" : ""}</span>}
											{repo.openIssuesCount > 0 && <span className="text-tw-text-secondary">{fmtCompact(repo.openIssuesCount)} open issue{repo.openIssuesCount !== 1 ? "s" : ""}</span>}
											{repo.license && <span className="text-tw-text-muted">{repo.license}</span>}
										</div>
										{repo.topics.length > 0 && (
											<div className="flex flex-wrap gap-1">
												{repo.topics.map((t) => (
													<span key={t} className="text-[9px] px-1.5 py-px rounded-full bg-tw-accent/10 text-tw-accent">{t}</span>
												))}
											</div>
										)}
										<a
											href={repo.url}
											target="_blank"
											rel="noopener noreferrer"
											className="text-[11px] text-tw-accent hover:underline self-start"
										>
											View on GitHub
										</a>
									</div>
								)}
							</div>
						))}
					</div>
				</div>
			);
		},

		// ─── Activity Summary ─────────────────────────────────────────
		ActivitySummary: ({ props }) => {
			return (
				<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2.5">
					<div className="flex items-baseline justify-between">
						<div className="text-[12px] text-tw-text-muted">Activity</div>
						<div className="text-[18px] font-semibold text-tw-text-primary tabular-nums">
							{fmtCompact(props.totalContributions)}
							<span className="text-[11px] text-tw-text-muted ml-1">contributions</span>
						</div>
					</div>

					{props.contributionYears.length > 0 && (
						<div className="flex items-center gap-1 text-[11px] text-tw-text-muted">
							Active since {Math.min(...props.contributionYears)}
							<span className="text-tw-text-muted"> · </span>
							{props.contributionYears.length} year{props.contributionYears.length !== 1 ? "s" : ""}
						</div>
					)}

					{props.pinned.length > 0 && (
						<div className="flex flex-col gap-1">
							<div className="text-[10px] text-tw-text-muted uppercase tracking-wider">Pinned</div>
							{props.pinned.map((repo) => (
								<a
									key={repo.name}
									href={repo.url}
									target="_blank"
									rel="noopener noreferrer"
									className="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-[#ffffff08] transition-colors"
								>
									<span className="text-[12px] text-tw-text-primary font-medium">{repo.name}</span>
									{repo.language && (
										<span className="text-[10px] text-tw-text-muted">{repo.language}</span>
									)}
									{repo.stars > 0 && (
										<span className="text-[10px] text-tw-text-muted tabular-nums ml-auto flex items-center gap-0.5">
											<svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>
											{fmtCompact(repo.stars)}
										</span>
									)}
								</a>
							))}
						</div>
					)}

					{props.orgs.length > 0 && (
						<div className="flex items-center gap-1.5">
							<span className="text-[10px] text-tw-text-muted shrink-0">Orgs</span>
							{props.orgs.slice(0, 8).map((org) => (
								<img key={org.login} src={org.avatarUrl} alt={org.login} title={org.login} className="size-5 rounded-sm" />
							))}
							{props.orgs.length > 8 && <span className="text-[10px] text-tw-text-muted">+{props.orgs.length - 8}</span>}
						</div>
					)}
				</div>
			);
		},

		// ─── Text Block ───────────────────────────────────────────────
		Text: ({ props }) => {
			const colorClass =
				props.variant === "muted"
					? "text-tw-text-muted"
					: props.variant === "error"
						? "text-tw-error"
						: props.variant === "success"
							? "text-tw-success"
							: "text-tw-text-secondary";

			return <div className={`text-[13px] ${colorClass}`}>{props.content}</div>;
		},

		// ─── Info Row ─────────────────────────────────────────────────
		InfoRow: ({ props }) => (
			<div className="flex items-center justify-between text-[12px]">
				<span className="text-tw-text-muted">{props.label}</span>
				<span className="text-tw-text-secondary">{props.value}</span>
			</div>
		),

		// ─── Container Card ───────────────────────────────────────────
		Card: ({ props, children }) => (
			<div className="rounded-xl bg-tw-card p-3 flex flex-col gap-2">
				{props.title && (
					<div className="text-[12px] text-tw-text-muted uppercase tracking-wider">
						{props.title}
					</div>
				)}
				{children}
			</div>
		),

		// ─── Stack Layout ─────────────────────────────────────────────
		Stack: ({ props, children }) => {
			const gapClass =
				props.gap === "sm" ? "gap-1" : props.gap === "lg" ? "gap-4" : "gap-2";

			return <div className={`flex flex-col ${gapClass}`}>{children}</div>;
		},
	},
});

// Fetches the score_breakdown spec via /api/tools/run (bypasses the LLM
// — no token cost) and renders it inline beneath the card.

type BreakdownState =
	| { phase: "idle" }
	| { phase: "loading" }
	| { phase: "ready"; spec: RenderSpec }
	| { phase: "error"; message: string };

function ScoreBreakdownButton({ username }: { username: string }) {
	const [state, setState] = useState<BreakdownState>({ phase: "idle" });

	async function load() {
		setState({ phase: "loading" });
		try {
			const res = await fetch("/api/tools/run", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name: "score_breakdown", args: { username } }),
			});
			const body = (await res.json()) as
				| { ok: true; spec: RenderSpec }
				| { ok: false; error: string };
			if (!res.ok || !body.ok) {
				const message = !body.ok ? body.error : `HTTP ${res.status}`;
				setState({ phase: "error", message });
				return;
			}
			setState({ phase: "ready", spec: body.spec });
		} catch (e) {
			setState({
				phase: "error",
				message: e instanceof Error ? e.message : String(e),
			});
		}
	}

	if (state.phase === "ready") {
		return (
			<div className="flex flex-col gap-2 pt-1 border-t border-tw-border">
				<JSONUIProvider registry={registry}>
					<Renderer spec={state.spec} registry={registry} />
				</JSONUIProvider>
				<button
					type="button"
					onClick={() => setState({ phase: "idle" })}
					className="self-start text-[10px] text-tw-text-muted hover:text-tw-text-secondary transition-colors"
				>
					Hide breakdown
				</button>
			</div>
		);
	}

	return (
		<div className="flex items-center gap-2 pt-0.5">
			<button
				type="button"
				onClick={load}
				disabled={state.phase === "loading"}
				className="text-[11px] px-2 py-1 rounded-md bg-[#FAFAFA08] hover:bg-[#FAFAFA12] text-tw-text-secondary hover:text-tw-text-primary transition-colors disabled:opacity-50"
			>
				{state.phase === "loading" ? "Loading…" : "Score breakdown"}
			</button>
			{state.phase === "error" && (
				<span className="text-[11px] text-tw-error">{state.message}</span>
			)}
		</div>
	);
}
