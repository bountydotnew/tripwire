import { useCallback, useRef } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
	RuleCardGrid,
	AiSlopViz,
	ProfilePictureViz,
	LanguageViz,
	MergedPrsViz,
	AccountAgeViz,
	MaxPrsPerDayViz,
	MaxFilesChangedViz,
	RepoActivityViz,
	ProfileReadmeViz,
} from "../../components/rules/rule-card-grid";
import { RuleDropdown } from "../../components/rules/rule-dropdown";
import { UserList } from "../../components/rules/user-list";
import { EmptyState } from "../../components/layout/empty-state";
import { toastManager } from "#/components/ui/toast";
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
		<div className="flex flex-col py-6 md:py-8 px-4 md:px-[50px] gap-6">
			<div className="flex items-start justify-between w-full">
				<div className="flex flex-col gap-1">
					<div className="h-7 w-16 bg-white/5 rounded" />
					<div className="h-4 w-40 bg-white/5 rounded" />
				</div>
			</div>
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
					<div key={i} className="h-[200px] w-full bg-white/5 rounded-xl" />
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
	const configQueryKey = trpc.rules.getConfig.queryKey({ repoId: repoId! });

	const configQuery = useQuery(
		trpc.rules.getConfig.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	// Merge with defaults to handle missing fields from older configs in DB
	const rawConfig = configQuery.data;
	const config: RuleConfig = {
		aiSlopDetection: { ...DEFAULT_RULE_CONFIG.aiSlopDetection, ...rawConfig?.aiSlopDetection },
		requireProfilePicture: { ...DEFAULT_RULE_CONFIG.requireProfilePicture, ...rawConfig?.requireProfilePicture },
		languageRequirement: { ...DEFAULT_RULE_CONFIG.languageRequirement, ...rawConfig?.languageRequirement },
		minMergedPrs: { ...DEFAULT_RULE_CONFIG.minMergedPrs, ...rawConfig?.minMergedPrs },
		accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...rawConfig?.accountAge },
		maxPrsPerDay: { ...DEFAULT_RULE_CONFIG.maxPrsPerDay, ...rawConfig?.maxPrsPerDay },
		maxFilesChanged: { ...DEFAULT_RULE_CONFIG.maxFilesChanged, ...rawConfig?.maxFilesChanged },
		repoActivityMinimum: { ...DEFAULT_RULE_CONFIG.repoActivityMinimum, ...rawConfig?.repoActivityMinimum },
		requireProfileReadme: { ...DEFAULT_RULE_CONFIG.requireProfileReadme, ...rawConfig?.requireProfileReadme },
	};

	const updateConfig = useMutation(
		trpc.rules.updateConfig.mutationOptions({
			onMutate: async () => {
				// Cancel any outgoing refetches so they don't overwrite our optimistic update
				await queryClient.cancelQueries({ queryKey: configQueryKey });

				// Snapshot the previous value for potential rollback
				const previousConfig = queryClient.getQueryData(configQueryKey);
				return { previousConfig };
			},
			onError: (error, _newData, context) => {
				// Roll back to the previous value on error
				if (context?.previousConfig) {
					queryClient.setQueryData(configQueryKey, context.previousConfig);
				}
				toastManager.add({
					title: "Failed to update rule",
					description: error.message || "Please try again",
					type: "error",
				});
			},
			onSettled: () => {
				// Always refetch after error or success to ensure cache is in sync
				queryClient.invalidateQueries({ queryKey: configQueryKey });
			},
		}),
	);

	// Debounce refs to prevent spam clicking
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingConfigRef = useRef<RuleConfig | null>(null);

	const flushUpdate = useCallback(() => {
		if (pendingConfigRef.current && repoId) {
			updateConfig.mutate({ repoId, config: pendingConfigRef.current });
			pendingConfigRef.current = null;
		}
	}, [repoId, updateConfig]);

	const debouncedUpdate = useCallback((newConfig: RuleConfig) => {
		// Store the latest config
		pendingConfigRef.current = newConfig;

		// Optimistically update cache immediately for instant feedback
		queryClient.setQueryData(configQueryKey, newConfig);

		// Clear existing timer
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}

		// Set new debounced timer (300ms)
		debounceRef.current = setTimeout(flushUpdate, 300);
	}, [configQueryKey, queryClient, flushUpdate]);

	const toggleRule = useCallback(<K extends keyof RuleConfig>(key: K, enabled: boolean) => {
		// Use pending config if exists, otherwise current config
		const baseConfig = pendingConfigRef.current ?? config;
		const newConfig = {
			...baseConfig,
			[key]: { ...baseConfig[key], enabled },
		};
		if (repoId) {
			debouncedUpdate(newConfig);
		}
	}, [config, repoId, debouncedUpdate]);

	const updateRuleValue = useCallback(<K extends keyof RuleConfig>(
		key: K,
		patch: Partial<RuleConfig[K]>,
	) => {
		const baseConfig = pendingConfigRef.current ?? config;
		const newConfig = {
			...baseConfig,
			[key]: { ...baseConfig[key], ...patch },
		};
		if (repoId) {
			debouncedUpdate(newConfig);
		}
	}, [config, repoId, debouncedUpdate]);

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
		config.maxPrsPerDay.enabled,
		config.maxFilesChanged.enabled,
		config.repoActivityMinimum.enabled,
		config.requireProfileReadme.enabled,
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
	const MAX_PRS_PER_DAY_OPTIONS = ["1", "2", "3", "5", "10"];
	const MAX_FILES_CHANGED_OPTIONS = ["5", "10", "20", "50", "100"];
	const REPO_ACTIVITY_OPTIONS = ["1", "3", "5", "10"];

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
		<div className="flex flex-col py-6 md:py-8 px-4 md:px-[50px] gap-6">
			{/* Header */}
			<div className="flex items-start justify-between w-full">
				<div className="flex flex-col gap-0.5">
					<h1 className="tracking-[-0.02em] text-white font-medium text-xl md:text-2xl leading-[30px] m-0">
						Rules
					</h1>
					<p className="text-[#FFFFFF73] text-sm leading-[18px] m-0">
						{activeCount} active
					</p>
				</div>
			</div>

			{/* Rule cards grid */}
			<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
				<RuleCardGrid
					title="AI slop detection"
					description="Use known detection patterns to minimize automated activity"
					enabled={config.aiSlopDetection.enabled}
					onToggle={(v) => toggleRule("aiSlopDetection", v)}
					visualization={<AiSlopViz />}
				/>
				<RuleCardGrid
					title="Require profile picture"
					description="Require a custom profile picture instead of GitHub's fallback"
					enabled={config.requireProfilePicture.enabled}
					onToggle={(v) => toggleRule("requireProfilePicture", v)}
					visualization={<ProfilePictureViz />}
				/>
				<RuleCardGrid
					title={
						<>
							Require all contributions in{" "}
							<RuleDropdown
								value={config.languageRequirement.language}
								options={LANGUAGE_OPTIONS}
								onChange={(lang) =>
									updateRuleValue("languageRequirement", { language: lang })
								}
							/>
						</>
					}
					description="Contributions in a disallowed language will be declined"
					enabled={config.languageRequirement.enabled}
					onToggle={(v) => toggleRule("languageRequirement", v)}
					visualization={<LanguageViz />}
				/>
				<RuleCardGrid
					title={
						<>
							At least{" "}
							<RuleDropdown
								value={String(config.minMergedPrs.count)}
								options={PR_COUNT_OPTIONS}
								onChange={(val) =>
									updateRuleValue("minMergedPrs", { count: Number(val) })
								}
							/>{" "}
							merged PRs
						</>
					}
					description="Minimum merged pull requests before they can contribute"
					enabled={config.minMergedPrs.enabled}
					onToggle={(v) => toggleRule("minMergedPrs", v)}
					visualization={<MergedPrsViz />}
				/>
				<RuleCardGrid
					title={
						<>
							Account older than{" "}
							<RuleDropdown
								value={`${config.accountAge.days} days`}
								options={ACCOUNT_AGE_OPTIONS}
								onChange={(val) =>
									updateRuleValue("accountAge", {
										days: Number.parseInt(val),
									})
								}
							/>
						</>
					}
					description="Block accounts created too recently from contributing"
					enabled={config.accountAge.enabled}
					onToggle={(v) => toggleRule("accountAge", v)}
					visualization={<AccountAgeViz />}
				/>
				<RuleCardGrid
					title={
						<>
							Max{" "}
							<RuleDropdown
								value={String(config.maxPrsPerDay.limit)}
								options={MAX_PRS_PER_DAY_OPTIONS}
								onChange={(val) =>
									updateRuleValue("maxPrsPerDay", { limit: Number(val) })
								}
							/>{" "}
							PRs per day
						</>
					}
					description="Rate limit how many PRs or issues a single user can open per day"
					enabled={config.maxPrsPerDay.enabled}
					onToggle={(v) => toggleRule("maxPrsPerDay", v)}
					visualization={<MaxPrsPerDayViz />}
				/>
				<RuleCardGrid
					title={
						<>
							Max{" "}
							<RuleDropdown
								value={String(config.maxFilesChanged.limit)}
								options={MAX_FILES_CHANGED_OPTIONS}
								onChange={(val) =>
									updateRuleValue("maxFilesChanged", { limit: Number(val) })
								}
							/>{" "}
							files changed
						</>
					}
					description="Block pull requests that touch too many files in a single submission"
					enabled={config.maxFilesChanged.enabled}
					onToggle={(v) => toggleRule("maxFilesChanged", v)}
					visualization={<MaxFilesChangedViz />}
				/>
				<RuleCardGrid
					title={
						<>
							At least{" "}
							<RuleDropdown
								value={String(config.repoActivityMinimum.minRepos)}
								options={REPO_ACTIVITY_OPTIONS}
								onChange={(val) =>
									updateRuleValue("repoActivityMinimum", { minRepos: Number(val) })
								}
							/>{" "}
							public repos
						</>
					}
					description="Contributor must have meaningful activity across other public repos"
					enabled={config.repoActivityMinimum.enabled}
					onToggle={(v) => toggleRule("repoActivityMinimum", v)}
					visualization={<RepoActivityViz />}
				/>
				<RuleCardGrid
					title="Require profile README"
					description="Contributors must have a profile README on their GitHub account"
					enabled={config.requireProfileReadme.enabled}
					onToggle={(v) => toggleRule("requireProfileReadme", v)}
					visualization={<ProfileReadmeViz />}
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
