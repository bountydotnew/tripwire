import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { authClient } from "@tripwire/auth/client";
import { useTRPC } from "#/integrations/trpc/react";
import { useWorkspace, useWorkspacePath } from "#/lib/workspace-context";
import { useGitHubUserFormatted } from "#/lib/use-github-user";
import { ContributionsHeatmap } from "#/components/profile/contributions-heatmap";
import { PinnedRepos } from "#/components/profile/pinned-repos";
import { GithubIcon } from "#/components/icons/github";
import { CommunitySignals } from "#/components/profile/community-signals";
import { Button } from "#/components/ui/button";
import { buildSeoMeta } from "#/lib/seo";

export const Route = createFileRoute("/_app/users/$username")({
	component: UserProfilePage,
	head: ({ params }) => ({
		meta: buildSeoMeta({
			title: `@${params.username}`,
			description: `GitHub profile and Tripwire contributor score for @${params.username}.`,
			path: `/users/${params.username}`,
			type: "profile",
		}),
	}),
});

function UserProfilePage() {
	const { username } = Route.useParams();
	const { repo } = useWorkspace();
	const { data: session } = authClient.useSession();
	const trpc = useTRPC();
	const eventsPath = useWorkspacePath("events");

	const githubUser = useGitHubUserFormatted(username);
	const user = githubUser.data;

	const scoreQuery = useQuery({
		...trpc.reputation.getScore.queryOptions({
			repoId: repo?.id ?? "",
			username,
		}),
		enabled: !!repo?.id,
	});

	const profileQuery = useQuery({
		...trpc.reputation.getProfile.queryOptions({
			repoId: repo?.id ?? "",
			username,
		}),
		enabled: !!repo?.id,
	});

	// Only show activity if the session user owns the repo or IS the viewed user
	const isOwner = !!repo?.id; // They can see the page because they're authed with repo access
	const isSelf = session?.user?.name?.toLowerCase() === username.toLowerCase();
	const canSeeActivity = isOwner || isSelf;

	const eventsQuery = useQuery({
		...trpc.events.list.queryOptions({
			repoId: repo?.id ?? "",
			targetUsername: username,
			limit: 20,
		}),
		enabled: !!repo?.id && canSeeActivity,
	});

	const scoreData = scoreQuery.data;
	const score = scoreData?.score ?? null;
	const profile = profileQuery.data;
	const events = eventsQuery.data?.events ?? [];

	if (githubUser.isLoading) {
		return (
			<div className="min-h-full flex items-center justify-center">
				<div className="w-5 h-5 border-2 border-tw-text-tertiary border-t-tw-accent rounded-full animate-spin" />
			</div>
		);
	}

	if (!user) {
		return (
			<div className="min-h-full flex flex-col items-center justify-center gap-2">
				<p className="text-tw-text-secondary text-[14px]">User @{username} not found</p>
			</div>
		);
	}

	const scoreTotal = score?.total ?? null;
	const scoreColor = scoreTotal !== null
		? scoreTotal >= 70 ? "#67E19F" : scoreTotal >= 40 ? "#D1BC00" : "#F56D5D"
		: "#6E6E6E";

	return (
		<div className="max-w-2xl w-full mx-auto pt-10 pb-16 px-4 flex flex-col gap-6">
			{/* Profile header */}
			<div className="flex items-start gap-4">
				<img src={user.avatar} alt="" className="w-16 h-16 rounded-full shrink-0" />
				<div className="flex-1 min-w-0 flex flex-col gap-1">
					<div className="flex items-center gap-2.5">
						<h1 className="text-[20px] font-semibold text-tw-text-primary m-0">
							@{user.username}
						</h1>
						{scoreTotal !== null && (
							<span
								className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono font-medium"
								style={{ backgroundColor: `${scoreColor}18`, color: scoreColor }}
							>
								{Math.round(scoreTotal)}
							</span>
						)}
					</div>
					{user.name && (
						<span className="text-[14px] text-tw-text-secondary">{user.name}</span>
					)}
					<div className="flex items-center gap-3 text-[12px] text-tw-text-tertiary mt-0.5 flex-wrap">
						{user.location && <span>{user.location}</span>}
						{user.company && (
							<>
								{user.location && <span>·</span>}
								<span>{user.company}</span>
							</>
						)}
						<span>Joined {user.accountAge} ago</span>
					</div>
				</div>
				<Button size="sm" variant="outline">
					<Link to={user.url} target="_blank" rel="noopener noreferrer" className="flex gap-2 items-center">
						<GithubIcon className="w-4 h-4" />
						View on GitHub
					</Link>
				</Button>
			</div>

			{user.bio && (
				<p className="text-[13px] text-tw-text-secondary leading-relaxed m-0 -mt-2">
					{user.bio}
				</p>
			)}

			{/* Score breakdown */}
			{score && scoreTotal !== null && (
				<section className="rounded-xl bg-tw-card p-1 flex flex-col gap-[3px]">
					<div className="flex items-baseline justify-between px-2 pt-1.5 pb-0.5">
						<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium">
							Contributor score
						</span>
						<span className="text-[14px] font-mono font-medium" style={{ color: scoreColor }}>
							{Math.round(scoreTotal)}/100
						</span>
					</div>
					<div className="rounded-[10px] bg-tw-inner p-3 flex flex-col gap-3">
						<div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-[#ffffff08]">
							{[
								{ value: score.globalReputation, color: "#34A6FF" },
								{ value: score.communitySignals, color: "#9F7AEA" },
								{ value: score.repoHistory, color: "#67E19F" },
							].map((seg) => (
								<div
									key={seg.color}
									className="h-full rounded-full"
									style={{
										width: `${(seg.value / 100) * 100}%`,
										backgroundColor: seg.color,
										minWidth: seg.value > 0 ? "3px" : "0",
									}}
								/>
							))}
						</div>
						<div className="flex items-center gap-4 text-[11px] text-tw-text-tertiary">
							<span className="flex items-center gap-1.5" title="Account age, followers, merged PRs, public repos">
								<span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#34A6FF" }} />
								Global {score.globalReputation}/40
							</span>
							<span className="flex items-center gap-1.5" title="Achievements, sponsors, orgs, social accounts, profile completeness">
								<span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#9F7AEA" }} />
								Community {score.communitySignals}/30
							</span>
							<span className="flex items-center gap-1.5" title="Tripwire event history — allowed, blocked, near-miss">
								<span className="w-2 h-2 rounded-full" style={{ backgroundColor: "#67E19F" }} />
								Repo {score.repoHistory}/20
							</span>
							{score.redFlags < 0 && (
								<span className="flex items-center gap-1.5" title="Suspicious patterns — high block ratio, new account with no activity">
									<span className="w-2 h-2 rounded-full bg-tw-error" />
									Flags {score.redFlags}
								</span>
							)}
						</div>
					</div>
				</section>
			)}

			{/* Contributions heatmap */}
			{profile?.contributions && (
				<section className="rounded-xl bg-tw-card p-1 flex flex-col gap-[3px]">
					<div className="px-2 pt-1.5 pb-0.5">
						<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium">
							Contributions
						</span>
					</div>
					<div className="rounded-[10px] bg-tw-inner p-3 overflow-hidden">
						<ContributionsHeatmap data={profile.contributions} />
					</div>
				</section>
			)}

			{/* Pinned repos */}
			{profile?.pinned && profile.pinned.length > 0 && (
				<section className="rounded-xl bg-tw-card p-1 flex flex-col gap-[3px]">
					<div className="px-2 pt-1.5 pb-0.5">
						<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium">
							Pinned repositories
						</span>
					</div>
					<div className="p-1">
						<PinnedRepos repos={profile.pinned} />
					</div>
				</section>
			)}

			{/* Community signals */}
			{profile && (
				<CommunitySignals
					graphql={profile.graphql}
					achievements={profile.achievements}
					username={username}
				/>
			)}

			{/* Stats grid */}
			<section className="rounded-xl bg-tw-card p-1 flex flex-col gap-[3px]">
				<div className="px-2 pt-1.5 pb-0.5">
					<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium">
						Profile
					</span>
				</div>
				<div className="rounded-[10px] bg-tw-inner p-3">
					<div className="grid grid-cols-2 gap-x-6">
						{[
							{ label: "Account age", value: user.accountAge, bad: user.accountAge.includes("day") || user.accountAge.includes("month") },
							{ label: "Public repos", value: user.publicReposFormatted, bad: user.publicRepos < 3 },
							{ label: "Followers", value: user.followersFormatted, bad: user.followers < 5 },
							{ label: "Following", value: String(user.following ?? 0) },
							{ label: "Total stars", value: user.totalStarsFormatted, bad: user.totalStars < 10 },
							{ label: "Profile README", value: user.hasReadme ? "Yes" : "No", bad: !user.hasReadme },
						].map((stat, i, arr) => (
							<div
								key={stat.label}
								className={`flex items-center justify-between py-2 ${i < arr.length - 2 ? "border-b border-tw-border" : ""}`}
							>
								<span className="text-[12px] text-tw-text-tertiary">{stat.label}</span>
								<span className="text-[13px] text-tw-text-primary tabular-nums flex items-center gap-1.5">
									{stat.value}
									{stat.bad && <span className="w-1.5 h-1.5 rounded-full bg-tw-error" />}
								</span>
							</div>
						))}
					</div>
				</div>
			</section>

			{/* Activity (restricted to org owners / self) */}
			{canSeeActivity && (
				<section className="rounded-xl bg-tw-card p-1 flex flex-col gap-[3px]">
					<div className="flex items-baseline justify-between px-2 pt-1.5 pb-0.5">
						<span className="text-[11px] uppercase tracking-[0.08em] text-tw-text-tertiary font-medium">
							Activity on {repo?.name ?? "this repo"}
						</span>
						<span className="text-[11px] text-tw-text-tertiary">
							{events.length} event{events.length !== 1 ? "s" : ""}
						</span>
					</div>
					{eventsQuery.isPending ? (
						<div className="rounded-[10px] bg-tw-inner p-4 flex items-center justify-center">
							<div className="w-4 h-4 border-2 border-tw-text-tertiary border-t-tw-accent rounded-full animate-spin" />
						</div>
					) : events.length === 0 ? (
						<div className="rounded-[10px] bg-tw-inner px-3 py-4 text-center text-[13px] text-tw-text-tertiary">
							No Tripwire events for this user yet
						</div>
					) : (
						<div className="flex flex-col gap-[3px]">
							{events.slice(0, 10).map((event) => {
								const sevColor =
									event.severity === "error" ? "#F56D5D"
										: event.severity === "success" ? "#67E19F"
											: event.severity === "warning" ? "#D1BC00"
												: "#9F9FA9";
								return (
									<Link
										key={event.id}
										to={`${eventsPath}/${event.id}`}
										className="rounded-[10px] bg-tw-inner px-3 py-2.5 flex items-center gap-3 hover:bg-tw-hover transition-colors"
									>
										<span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: sevColor }} />
										<div className="flex-1 min-w-0">
											<div className="text-[13px] text-tw-text-primary truncate">
												{event.description ?? event.action}
											</div>
										</div>
										{event.githubRef && (
											<span className="text-[11px] font-mono text-tw-text-tertiary shrink-0">
												{event.githubRef}
											</span>
										)}
										<span className="text-[11px] text-tw-text-tertiary shrink-0">
											{formatEventTime(event.createdAt)}
										</span>
									</Link>
								);
							})}
						</div>
					)}
				</section>
			)}
		</div>
	);
}

function formatEventTime(date: Date | string): string {
	const d = typeof date === "string" ? new Date(date) : date;
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	const mins = Math.floor(diff / 60000);
	const hrs = Math.floor(mins / 60);
	const days = Math.floor(hrs / 24);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	if (hrs < 24) return `${hrs}h`;
	if (days < 7) return `${days}d`;
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
