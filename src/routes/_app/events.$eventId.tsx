import { useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "#/integrations/trpc/react";
import { useWorkspace } from "#/lib/workspace-context";
import { createUserFromUsername } from "#/utils/home";
import { toastManager } from "#/components/ui/toast";

export const Route = createFileRoute("/_app/events/$eventId")({
	component: EventDetailPage,
});

function EventDetailPage() {
	const { eventId } = Route.useParams();
	const navigate = useNavigate();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const { repo } = useWorkspace();
	const [actionStatus, setActionStatus] = useState<"idle" | "blacklisted" | "safe" | "closed">("idle");

	// Fetch the event
	const eventQuery = useQuery({
		...trpc.events.get.queryOptions({ eventId }),
		enabled: !!eventId,
	});

	const event = eventQuery.data;
	const isLoading = eventQuery.isPending;
	const error = eventQuery.error;

	// Check if user is already blacklisted
	const repoId = event?.repo?.id || repo?.id;
	const blacklistQuery = useQuery({
		...trpc.blacklist.list.queryOptions({ repoId: repoId || "" }),
		enabled: !!repoId,
	});
	const targetUsername = event?.targetGithubUsername;
	const isAlreadyBlacklisted = blacklistQuery.data?.some(
		(entry) => entry.githubUsername === targetUsername
	) ?? false;

	// Blacklist mutation
	const blacklistMutation = useMutation({
		...trpc.blacklist.add.mutationOptions(),
		onSuccess: () => {
			setActionStatus("blacklisted");
			queryClient.invalidateQueries({ queryKey: ["blacklist"] });
			toastManager.add({
				type: "success",
				title: "User blacklisted",
				description: `@${targetUsername} has been added to the blacklist.`,
			});
		},
		onError: (error) => {
			toastManager.add({
				type: "error",
				title: "Failed to blacklist",
				description: error.message,
			});
		},
	});

	// Whitelist mutation
	const whitelistMutation = useMutation({
		...trpc.whitelist.add.mutationOptions(),
		onSuccess: () => {
			setActionStatus("safe");
			queryClient.invalidateQueries({ queryKey: ["whitelist"] });
			toastManager.add({
				type: "success",
				title: "User whitelisted",
				description: `@${targetUsername} has been added to the whitelist.`,
			});
		},
		onError: (error) => {
			toastManager.add({
				type: "error",
				title: "Failed to whitelist",
				description: error.message,
			});
		},
	});

	if (isLoading) {
		return (
			<div className="min-h-full flex items-center justify-center">
				<div className="w-6 h-6 border-2 border-tw-text-tertiary border-t-tw-accent rounded-full animate-spin" />
			</div>
		);
	}

	if (error || !event) {
		return (
			<div className="min-h-full flex flex-col items-center justify-center gap-4">
				<p className="text-tw-text-secondary">Event not found</p>
				<button
					type="button"
					onClick={() => navigate({ to: "/events" })}
					className="text-tw-accent hover:underline"
				>
					Back to Events
				</button>
			</div>
		);
	}

	const displayEvent = event;

	const sevColor =
		displayEvent?.severity === "error"
			? "#F56D5D"
			: displayEvent?.severity === "success"
				? "#67E19F"
				: "#D1BC00";

	const username = displayEvent?.targetGithubUsername || "unknown";
	const user = createUserFromUsername(username);

	return (
		<div className="relative min-h-full pb-16">
			<div className="max-w-2xl w-[672px] mx-auto pt-12 pb-8 px-4 flex flex-col gap-5">
				{/* Breadcrumb */}
				<div className="flex items-center gap-1.5 text-[13px] text-tw-text-tertiary">
					<Link
						to="/home"
						className="hover:text-tw-text-secondary flex items-center gap-1 transition-colors"
					>
						<span>←</span> Home
					</Link>
					<span className="text-[#363639]">/</span>
					<Link
						to="/events"
						className="hover:text-tw-text-secondary transition-colors"
					>
						Events
					</Link>
					<span className="text-[#363639]">/</span>
					<span className="font-mono text-tw-text-secondary">
						{displayEvent?.githubRef || eventId.slice(0, 8)}
					</span>
				</div>

				{/* Hero */}
				<div className="flex flex-col items-start rounded-xl py-1 px-2 gap-3">
					<div className="flex items-center gap-2">
						<SeverityPill severity={displayEvent?.severity || "warning"} />
						<StatusChip status="open" />
						<span className="text-[11px] text-tw-text-tertiary font-mono px-2 py-0.5 rounded bg-[#ffffff08]">
							id: {eventId.slice(0, 8)}
						</span>
					</div>
					<h1
						className="text-[28px] leading-[36px] text-tw-text-primary tracking-[-0.01em] m-0"
						style={{
							fontFamily: "'Playfair Display', serif",
							fontWeight: 500,
						}}
					>
						{getEventTitle(displayEvent?.action || "", displayEvent?.severity)}
					</h1>
					<p className="text-[16px] leading-[24px] text-[#EEEEEE80] m-0 max-w-[560px]">
						{displayEvent?.description ||
							`Tripwire flagged activity from @${username}`}
					</p>
					<div className="flex items-center flex-wrap gap-3 mt-1 text-[13px] text-tw-text-tertiary">
						<span className="flex items-center gap-1.5">
							<IssueCircle color={sevColor} />
							{displayEvent?.repo?.fullName || "unknown/repo"}{" "}
							<span className="font-mono text-tw-text-secondary">
								{displayEvent?.githubRef || "#???"}
							</span>
						</span>
						<span className="text-[#363639]">·</span>
						<span>{formatRelativeTime(displayEvent?.createdAt)}</span>
					</div>
				</div>

				{/* Primary actions row */}
				<div className="flex items-center gap-2 px-2">
					{actionStatus === "idle" ? (
						<>
							{/* Show what Tripwire already did */}
							{isAlreadyActioned(displayEvent?.action) && (
								<div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-tw-inner text-[13px] text-tw-text-secondary">
									<CheckIcon />
									<span>Tripwire {getActionedLabel(displayEvent?.action)}</span>
								</div>
							)}
							{/* Blacklist option */}
							<ActionPill
								variant={isAlreadyActioned(displayEvent?.action) ? "default" : "primary"}
								onClick={() => {
									const repoId = displayEvent?.repo?.id || repo?.id;
									if (repoId && username !== "unknown") {
										blacklistMutation.mutate({
											repoId,
											githubUsername: username,
										});
									}
								}}
								disabled={blacklistMutation.isPending || isAlreadyBlacklisted}
							>
								<ShieldIcon />
								{isAlreadyBlacklisted
									? `@${username} is blacklisted`
									: blacklistMutation.isPending
										? "Adding..."
										: `Blacklist @${username}`}
							</ActionPill>
							{/* Whitelist option */}
							<ActionPill
								variant="ghost"
								onClick={() => {
									const repoId = displayEvent?.repo?.id || repo?.id;
									if (repoId && username !== "unknown") {
										whitelistMutation.mutate({
											repoId,
											githubUsername: username,
										});
									}
								}}
								disabled={whitelistMutation.isPending}
							>
								<CheckIcon />
								{whitelistMutation.isPending ? "Adding..." : "Add to whitelist"}
							</ActionPill>
						</>
					) : (
						<div className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-tw-inner text-[13px]">
							{actionStatus === "blacklisted" && (
								<>
									<ShieldIcon />
									<span className="text-tw-text-primary">
										@{username} has been blacklisted
									</span>
								</>
							)}
							{actionStatus === "safe" && (
								<>
									<CheckIcon />
									<span className="text-tw-text-primary">
										@{username} added to whitelist
									</span>
								</>
							)}
						</div>
					)}
				</div>

				{/* Flagged content */}
				<Block label="Flagged content">
					<div className="flex flex-col gap-2.5 pt-1">
						<div className="px-1">
							<OutlineCard>
								<div className="flex items-center gap-2 px-0.5 py-0.5">
									<img
										src={user.avatar}
										className="w-[22px] h-[22px] rounded-full shrink-0"
										alt=""
									/>
									<span className="text-[14px] leading-5 text-tw-text-primary whitespace-nowrap">
										@{username}
									</span>
									<span className="text-[13px] text-tw-text-tertiary whitespace-nowrap">
										opened this {displayEvent?.contentType || "issue"}{" "}
										{formatRelativeTime(displayEvent?.createdAt)}
									</span>
								</div>
							</OutlineCard>
						</div>
						<div className="rounded-[10px] bg-tw-inner p-3">
							<div className="text-[14px] leading-5 text-tw-text-primary mb-2">
								Content flagged by Tripwire
							</div>
							<pre className="text-[12.5px] font-mono text-tw-text-secondary whitespace-pre-wrap leading-[20px] m-0">
								{displayEvent?.description || "No content preview available."}
							</pre>
						</div>
					</div>
				</Block>

				{/* Rule trace */}
				<Block
					label="Rule trace"
					note={`${displayEvent?.ruleName ? "1 rule triggered" : "Rules evaluated"}`}
				>
					<div className="flex flex-col gap-[3px]">
						{displayEvent?.ruleName ? (
							<RuleTraceRow
								label={formatRuleName(displayEvent.ruleName)}
								result={
									displayEvent.severity === "error" ? "blocked" : "flagged"
								}
								detail="Rule triggered on this content"
							/>
						) : (
							<div className="rounded-[10px] bg-tw-inner px-3 py-2.5 text-[13px] text-tw-text-secondary">
								No rule trace available
							</div>
						)}
					</div>
				</Block>

				{/* Contributor */}
				<Block label="Contributor" note={`Risk score pending`}>
					<div className="rounded-[10px] bg-tw-inner p-3 flex flex-col gap-4">
						{/* Identity + actions */}
						<div className="flex items-center gap-3">
							<div className="relative shrink-0">
								<img
									src={user.avatar}
									className="w-12 h-12 rounded-full"
									alt=""
								/>
								<span className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-tw-surface flex items-center justify-center">
									<span
										className="w-2 h-2 rounded-full"
										style={{ backgroundColor: sevColor }}
									/>
								</span>
							</div>
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-[15px] leading-5 text-tw-text-primary font-medium">
										@{username}
									</span>
									<span className="text-[11px] text-tw-text-tertiary">·</span>
									<span className="text-[12px] text-tw-text-tertiary">
										No location
									</span>
								</div>
								<div className="text-[12px] leading-[18px] text-tw-text-tertiary mt-0.5 truncate">
									Joined {user.accountAge} ago · {user.publicRepos} public repos
								</div>
							</div>
							<a
								href={`https://github.com/${username}`}
								target="_blank"
								rel="noopener noreferrer"
								className="shrink-0 text-[12px] text-tw-text-secondary hover:text-tw-text-primary transition-colors rounded-md px-2 py-1 hover:bg-tw-inner"
							>
								View profile →
							</a>
						</div>

						{/* Stat grid */}
						<div className="grid grid-cols-2 gap-x-6">
							{[
								{
									label: "Account age",
									value: user.accountAge,
									bad: user.accountAge.includes("day"),
								},
								{
									label: "Public repos",
									value: user.publicRepos,
									bad: user.publicRepos < 3,
								},
								{
									label: "Followers",
									value: user.followers,
									bad: user.followers < 5,
								},
								{
									label: "Merged PRs",
									value: user.mergedPrs,
									bad: user.mergedPrs < 1,
								},
								{
									label: "Profile README",
									value: user.readme ? "Yes" : "No",
									bad: !user.readme,
								},
							].map((stat, index, stats) => (
								<div
									key={stat.label}
									className={`flex items-center justify-between py-2 ${index < stats.length - 1 ? "border-b border-tw-border" : ""}`}
								>
									<span className="text-[12px] text-tw-text-tertiary">
										{stat.label}
									</span>
									<span className="text-[13px] text-tw-text-primary tabular-nums flex items-center gap-1.5">
										{stat.value}
										{stat.bad && (
											<span className="w-1.5 h-1.5 rounded-full bg-tw-error" />
										)}
									</span>
								</div>
							))}
						</div>
					</div>
				</Block>

				{/* Timeline */}
				<Block label="Timeline" note="Event history">
					<div className="flex flex-col gap-[3px]">
						<TimelineRow
							time={formatRelativeTime(displayEvent?.createdAt)}
							kind="opened"
							label={`${displayEvent?.contentType || "Content"} received`}
							detail={`From @${username}`}
						/>
						<TimelineRow
							time={formatRelativeTime(displayEvent?.createdAt)}
							kind="pipeline"
							label="Tripwire pipeline started"
							detail="Rules evaluated"
						/>
						{displayEvent?.ruleName && (
							<TimelineRow
								time={formatRelativeTime(displayEvent?.createdAt)}
								kind={displayEvent.severity === "error" ? "block" : "flag"}
								label={`${formatRuleName(displayEvent.ruleName)} → ${displayEvent.severity === "error" ? "blocked" : "flagged"}`}
								detail={displayEvent.description || "Rule triggered"}
							/>
						)}
					</div>
				</Block>
			</div>
		</div>
	);
}

// ────────────────── Helper Components ──────────────────

function Block({
	label,
	note,
	children,
}: {
	label: string;
	note?: string;
	children: React.ReactNode;
}) {
	return (
		<section className="flex flex-col relative rounded-xl overflow-hidden gap-[3px] w-full bg-tw-card p-1">
			<div className="flex items-baseline justify-between px-2 pt-1.5 pb-0.5 gap-4">
				<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium shrink-0">
					{label}
				</span>
				{note && (
					<span className="text-[11px] text-tw-text-tertiary text-right truncate">
						{note}
					</span>
				)}
			</div>
			{children}
		</section>
	);
}

function OutlineCard({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="rounded-[10px]"
			style={{ outline: "2px solid #6E6E6E", outlineOffset: "2px" }}
		>
			<div className="rounded-[10px] bg-tw-inner p-2">{children}</div>
		</div>
	);
}

function ActionPill({
	children,
	variant = "default",
	onClick,
	disabled = false,
}: {
	children: React.ReactNode;
	variant?: "primary" | "default" | "ghost";
	onClick?: () => void;
	disabled?: boolean;
}) {
	const base =
		"flex items-center gap-1.5 h-8 px-3 rounded-[10px] text-[13px] leading-none transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
	if (variant === "primary") {
		return (
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				className={`${base} bg-tw-text-primary text-tw-bg hover:bg-white`}
			>
				{children}
			</button>
		);
	}
	if (variant === "ghost") {
		return (
			<button
				type="button"
				onClick={onClick}
				disabled={disabled}
				className={`${base} text-tw-text-secondary hover:text-tw-text-primary hover:bg-tw-card`}
			>
				{children}
			</button>
		);
	}
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`${base} bg-tw-card text-tw-text-primary hover:bg-tw-hover`}
		>
			{children}
		</button>
	);
}

function SeverityPill({ severity }: { severity: string }) {
	const conf: Record<string, { color: string; label: string }> = {
		error: { color: "#F56D5D", label: "High severity" },
		warning: { color: "#D1BC00", label: "Medium severity" },
		success: { color: "#67E19F", label: "Allowed" },
		info: { color: "#9F9FA9", label: "Info" },
	};
	const severityConfig = conf[severity] || conf.info;
	return (
		<span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium bg-tw-card text-tw-text-primary">
			<span
				className="w-1.5 h-1.5 rounded-full"
				style={{ backgroundColor: severityConfig.color }}
			/>
			{severityConfig.label}
		</span>
	);
}

function StatusChip({ status }: { status: string }) {
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-md bg-tw-card text-tw-text-secondary text-[11px] font-medium capitalize">
			{status}
		</span>
	);
}

function IssueCircle({ color }: { color: string }) {
	return (
		<svg width="12" height="12" viewBox="0 0 12 12" fill="none">
			<circle cx="6" cy="6" r="4.5" stroke={color} strokeWidth="1.3" />
			<circle cx="6" cy="6" r="1.3" fill={color} />
		</svg>
	);
}

function ShieldIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
			<path
				d="M12 2L4 5V11C4 16 7.5 20.5 12 22C16.5 20.5 20 16 20 11V5L12 2Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none">
			<path
				d="M5 12L10 17L20 7"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function RuleTraceRow({
	label,
	result,
	detail,
}: {
	label: string;
	result: "blocked" | "flagged" | "passed" | "skipped";
	detail: string;
}) {
	const resultColors: Record<string, string> = {
		blocked: "#F56D5D",
		flagged: "#D1BC00",
		passed: "#67E19F",
		skipped: "#6E6E6E",
	};
	return (
		<div className="rounded-[10px] bg-tw-inner px-3 py-2.5 flex items-center gap-3">
			<RuleResultGlyph result={result} />
			<div className="flex-1 min-w-0">
				<div className="text-[14px] leading-5 text-tw-text-primary">{label}</div>
				<div className="text-[12px] leading-[18px] text-tw-text-tertiary truncate">
					{detail}
				</div>
			</div>
			<span className="shrink-0 inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-md bg-tw-card text-tw-text-secondary">
				<span
					className="w-1.5 h-1.5 rounded-full"
					style={{ backgroundColor: resultColors[result] }}
				/>
				{result.charAt(0).toUpperCase() + result.slice(1)}
			</span>
		</div>
	);
}

function RuleResultGlyph({ result }: { result: string }) {
	if (result === "blocked" || result === "flagged") {
		const color = result === "blocked" ? "#F56D5D" : "#D1BC00";
		return (
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
				<path
					fillRule="evenodd"
					clipRule="evenodd"
					d="M13.998 21.75C16.253 21.75 18.033 21.75 19.352 21.554C20.69 21.354 21.776 20.922 22.376 19.863C22.975 18.806 22.79 17.65 22.276 16.395C21.772 15.161 20.866 13.633 19.717 11.696L19.669 11.616L17.744 8.371L17.698 8.293C16.596 6.434 15.723 4.963 14.911 3.965C14.083 2.946 13.184 2.25 12 2.25C10.816 2.25 9.917 2.946 9.089 3.965C8.277 4.963 7.405 6.434 6.303 8.293L6.256 8.371L4.331 11.616L4.283 11.696C3.135 13.633 2.228 15.161 1.724 16.395C1.21 17.65 1.025 18.806 1.624 19.863C2.224 20.922 3.31 21.354 4.648 21.554C5.967 21.75 7.747 21.75 10.002 21.75L13.998 21.75ZM12 10.25C11.448 10.25 11 9.802 11 9.25C11 8.698 11.448 8.25 12 8.25C12.552 8.25 13 8.698 13 9.25C13 9.802 12.552 10.25 12 10.25ZM12 18C11.448 18 11 17.552 11 17L11 13C11 12.448 11.448 12 12 12C12.552 12 13 12.448 13 13L13 17C13 17.552 12.552 18 12 18Z"
					fill={color}
				/>
			</svg>
		);
	}
	if (result === "passed") {
		return (
			<svg width="16" height="16" viewBox="0 0 16 16" fill="#67E19F">
				<circle cx="8" cy="8" r="8" />
				<path
					d="M5 8L7 10L11 6"
					stroke="#0D0D0F"
					strokeWidth="1.5"
					strokeLinecap="round"
					strokeLinejoin="round"
					fill="none"
				/>
			</svg>
		);
	}
	return (
		<span className="w-4 h-4 flex items-center justify-center">
			<span className="w-2 h-[2px] bg-tw-text-tertiary" />
		</span>
	);
}

function TimelineRow({
	time,
	kind,
	label,
	detail,
}: {
	time: string;
	kind: string;
	label: string;
	detail: string;
}) {
	const kindColors: Record<string, string> = {
		opened: "#9F9FA9",
		pipeline: "#34A6FF",
		block: "#F56D5D",
		flag: "#D1BC00",
		action: "#67E19F",
		notify: "#B4B4B4",
	};
	const accent = kindColors[kind] || "#9F9FA9";

	return (
		<div className="rounded-[10px] bg-tw-inner p-2 flex items-start gap-2.5">
			<div
				className="w-[10px] h-[10px] rounded-full mt-1 shrink-0"
				style={{ backgroundColor: accent }}
			/>
			<div className="flex-1 min-w-0">
				<div className="text-[13px] leading-5 text-tw-text-primary">{label}</div>
				<div className="text-[11px] text-tw-text-tertiary">{detail}</div>
			</div>
			<span className="text-[11px] text-tw-text-tertiary whitespace-nowrap font-mono">
				{time}
			</span>
		</div>
	);
}

// ────────────────── Helper Functions ──────────────────

function isAlreadyActioned(action: string | undefined): boolean {
	const actionedActions = [
		"pipeline_blocked",
		"pr_closed",
		"issue_closed",
		"issue_deleted",
		"comment_deleted",
		"blacklist_blocked",
	];
	return action ? actionedActions.includes(action) : false;
}

function getActionedLabel(action: string | undefined): string {
	const labels: Record<string, string> = {
		pipeline_blocked: "blocked this content",
		pr_closed: "closed this PR",
		issue_closed: "closed this issue",
		issue_deleted: "deleted this issue",
		comment_deleted: "deleted this comment",
		blacklist_blocked: "blocked this user",
	};
	return labels[action || ""] || "took action";
}

function getEventTitle(action: string, severity: string | null | undefined): string {
	const titles: Record<string, string> = {
		pipeline_blocked: "Content blocked",
		pipeline_allowed: "Content allowed",
		rule_near_miss: "Near miss warning",
		blacklist_blocked: "Blacklisted user blocked",
		whitelist_bypass: "Whitelist bypass",
		pr_closed: "Pull request closed",
		issue_closed: "Issue closed",
		comment_deleted: "Comment deleted",
	};
	let title = titles[action] || "Flagged activity";
	if (severity === "error") title = `Blocked — ${title.toLowerCase()}`;
	if (severity === "warning" && action !== "rule_near_miss")
		title = `Suspected spam`;
	return title;
}

function formatRuleName(ruleName: string): string {
	const names: Record<string, string> = {
		cryptoAddressDetection: "Crypto address detection",
		spamDetection: "Spam pattern match",
		accountAge: "Account age",
		repoActivityMinimum: "Repo activity",
		languageRequirement: "Language requirement",
		requireProfilePicture: "Profile picture",
		minMergedPrs: "Minimum merged PRs",
		maxPrsPerDay: "Max PRs per day",
		maxFilesChanged: "Max files changed",
		requireProfileReadme: "Profile README",
		aiSlopDetection: "AI slop detection",
	};
	return names[ruleName] || ruleName;
}

function formatRelativeTime(date: Date | undefined | null): string {
	if (!date) return "Unknown time";
	const now = new Date();
	const diff = now.getTime() - new Date(date).getTime();
	const minutes = Math.floor(diff / 60000);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days === 1) return "yesterday";
	return `${days}d ago`;
}

