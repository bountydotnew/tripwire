import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { RuleCard } from "../../components/rules/rule-card";
import { RuleDropdown } from "../../components/rules/rule-dropdown";
import { UserList } from "../../components/rules/user-list";
import { EmptyState } from "../../components/layout/empty-state";
import { useTRPC } from "#/integrations/trpc/react";
import { useWorkspace } from "#/lib/workspace-context";
import { DEFAULT_RULE_CONFIG, type RuleConfig } from "#/db/schema";
import { env } from "#/env";

export const Route = createFileRoute("/_app/rules")({
	component: RulesPage,
	pendingComponent: RulesPageSkeleton,
});

function RulesPageSkeleton() {
	return (
		<div className="flex flex-col items-center py-6 md:py-8 px-4 md:px-[120px] gap-4 md:gap-6">
			<div className="flex items-start justify-between w-full">
				<div className="flex flex-col gap-1">
					<div className="h-7 w-16 bg-white/5 rounded" />
					<div className="h-4 w-20 bg-white/5 rounded" />
				</div>
			</div>
			<div className="flex flex-col gap-2.5 w-full">
				{[1, 2, 3, 4, 5].map((i) => (
					<div key={i} className="h-[72px] w-full bg-white/5 rounded-xl" />
				))}
			</div>
			<div className="h-24 w-full bg-white/5 rounded-xl" />
			<div className="h-24 w-full bg-white/5 rounded-xl" />
		</div>
	);
}

function RulesPage() {
	const { repo, repos, isLoading } = useWorkspace();
	const repoId = repo?.id;
	const trpc = useTRPC();
	const githubAppSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-app";
	const queryClient = useQueryClient();

	// ─── Rule config ──────────────────────────────────────────
	const configQuery = useQuery(
		trpc.rules.getConfig.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const config: RuleConfig = configQuery.data ?? DEFAULT_RULE_CONFIG;

	const updateConfig = useMutation(
		trpc.rules.updateConfig.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.rules.getConfig.queryKey({ repoId: repoId! }) });
			},
		}),
	);

	function toggleRule<K extends keyof RuleConfig>(key: K, enabled: boolean) {
		const newConfig = {
			...config,
			[key]: { ...config[key], enabled },
		};
		if (repoId) {
			updateConfig.mutate({ repoId, config: newConfig });
		}
	}

	function updateRuleValue<K extends keyof RuleConfig>(
		key: K,
		patch: Partial<RuleConfig[K]>,
	) {
		const newConfig = {
			...config,
			[key]: { ...config[key], ...patch },
		};
		if (repoId) {
			updateConfig.mutate({ repoId, config: newConfig });
		}
	}

	// ─── Whitelist ────────────────────────────────────────────
	const whitelistQuery = useQuery(
		trpc.whitelist.list.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const whitelistUsers = (whitelistQuery.data ?? []).map((e) => ({
		username: e.githubUsername,
		avatarUrl: e.avatarUrl ?? `https://github.com/${e.githubUsername}.png`,
	}));

	const addWhitelist = useMutation(
		trpc.whitelist.add.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.whitelist.list.queryKey({ repoId: repoId! }) });
			},
		}),
	);

	const removeWhitelist = useMutation(
		trpc.whitelist.remove.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.whitelist.list.queryKey({ repoId: repoId! }) });
			},
		}),
	);

	// ─── Blacklist ────────────────────────────────────────────
	const blacklistQuery = useQuery(
		trpc.blacklist.list.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const blacklistUsers = (blacklistQuery.data ?? []).map((e) => ({
		username: e.githubUsername,
		avatarUrl: e.avatarUrl ?? `https://github.com/${e.githubUsername}.png`,
	}));

	const addBlacklist = useMutation(
		trpc.blacklist.add.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.blacklist.list.queryKey({ repoId: repoId! }) });
			},
		}),
	);

	const removeBlacklist = useMutation(
		trpc.blacklist.remove.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.blacklist.list.queryKey({ repoId: repoId! }) });
			},
		}),
	);

	// ─── Derived stats ────────────────────────────────────────
	const activeCount = [
		config.aiSlopDetection.enabled,
		config.requireProfilePicture.enabled,
		config.languageRequirement.enabled,
		config.minMergedPrs.enabled,
		config.accountAge.enabled,
	].filter(Boolean).length;

	const LANGUAGE_OPTIONS = [
		"English",
		"Spanish",
		"French",
		"German",
		"Portuguese",
		"Japanese",
		"Chinese",
		"Korean",
		"Russian",
		"Arabic",
	];

	const PR_COUNT_OPTIONS = ["5", "10", "15", "25", "50", "100"];
	const ACCOUNT_AGE_OPTIONS = ["7 days", "14 days", "30 days", "60 days", "90 days", "180 days"];

	// Show empty state if no repos are connected
	if (!isLoading && repos.length === 0) {
		return (
			<EmptyState
				title="Install the Tripwire GitHub App"
				description="Connect your GitHub repositories to start protecting them from spam PRs, bot accounts, and AI-generated contributions."
				action={{
					label: "Install GitHub App",
					href: `https://github.com/apps/${githubAppSlug}/installations/new`,
				}}
			/>
		);
	}

	// Show skeleton while loading
	const isDataLoading = isLoading || configQuery.isLoading || whitelistQuery.isLoading || blacklistQuery.isLoading;
	if (isDataLoading) {
		return <RulesPageSkeleton />;
	}

	return (
		<div className="flex flex-col items-center py-6 md:py-8 px-4 md:px-[120px] gap-4 md:gap-6">
			{/* Header */}
			<div className="flex items-start justify-between w-full">
				<div className="flex flex-col gap-0.5">
					<h1 className="tracking-[-0.02em] text-white font-medium text-xl md:text-2xl leading-[30px] m-0">
						Rules
					</h1>
					<p className="text-tw-text-secondary text-sm leading-[18px] m-0">
						{activeCount} active
					</p>
				</div>
			</div>

			{/* Rule cards */}
			<div className="flex flex-col items-start gap-2.5 w-full">
				<RuleCard
					title="AI slop detection"
					description="Use known detection patterns to minimize the amount of automated activity"
					enabled={config.aiSlopDetection.enabled}
					onToggle={(v) => toggleRule("aiSlopDetection", v)}
				/>
				<RuleCard
					title="Require profile picture"
					description="Requires all contributors to have a custom profile picture instead of GitHub's fallback image"
					enabled={config.requireProfilePicture.enabled}
					onToggle={(v) => toggleRule("requireProfilePicture", v)}
				/>
				<RuleCard
					title={
						<span className="flex items-center gap-[5px] flex-wrap">
							<span>Require all contributions to be in </span>
							<RuleDropdown
								value={config.languageRequirement.language}
								options={LANGUAGE_OPTIONS}
								onChange={(lang) =>
									updateRuleValue("languageRequirement", { language: lang })
								}
							/>
						</span>
					}
					description="Any contributions made to the repo with a disallowed language will automatically be declined"
					enabled={config.languageRequirement.enabled}
					onToggle={(v) => toggleRule("languageRequirement", v)}
				/>
				<RuleCard
					title={
						<span className="flex items-center gap-[5px] flex-wrap">
							<span>Contributors must have at least</span>
							<RuleDropdown
								value={String(config.minMergedPrs.count)}
								options={PR_COUNT_OPTIONS}
								onChange={(val) =>
									updateRuleValue("minMergedPrs", { count: Number(val) })
								}
							/>
							<span>merged PRs</span>
						</span>
					}
					description="The minimum number of merged pull requests contributors must have before they're allowed to contribute to your repositories"
					enabled={config.minMergedPrs.enabled}
					onToggle={(v) => toggleRule("minMergedPrs", v)}
				/>
				<RuleCard
					title={
						<span className="flex items-center gap-[5px] flex-wrap">
							<span>Block new accounts created under</span>
							<RuleDropdown
								value={`${config.accountAge.days} days`}
								options={ACCOUNT_AGE_OPTIONS}
								onChange={(val) =>
									updateRuleValue("accountAge", {
										days: Number.parseInt(val),
									})
								}
							/>
							<span>ago</span>
						</span>
					}
					description="Block accounts that were created too recently to contribute to your repositories"
					enabled={config.accountAge.enabled}
					onToggle={(v) => toggleRule("accountAge", v)}
				/>
			</div>

			{/* Whitelist */}
			<UserList
				title="Whitelist"
				description="Allow specific users to interact with your repositories without being affected by the rules"
				users={whitelistUsers}
				onAdd={async (username) => {
					if (repoId) {
						await addWhitelist.mutateAsync({
							repoId,
							githubUsername: username,
						});
					}
				}}
				onRemove={(username) => {
					if (repoId) {
						removeWhitelist.mutate({ repoId, githubUsername: username });
					}
				}}
				isAdding={addWhitelist.isPending}
			/>

			{/* Blacklist */}
			<UserList
				title="Blacklist"
				description="Prevent any user on GitHub from interacting with your repositories"
				users={blacklistUsers}
				onAdd={async (username) => {
					if (repoId) {
						await addBlacklist.mutateAsync({
							repoId,
							githubUsername: username,
						});
					}
				}}
				onRemove={(username) => {
					if (repoId) {
						removeBlacklist.mutate({ repoId, githubUsername: username });
					}
				}}
				isAdding={addBlacklist.isPending}
			/>
		</div>
	);
}
