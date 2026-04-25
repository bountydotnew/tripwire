import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	AccountAgeViz,
	AiSlopViz,
	CryptoViz,
	LanguageViz,
	MaxFilesChangedViz,
	MaxPrsPerDayViz,
	MergedPrsViz,
	ProfilePictureViz,
	ProfileReadmeViz,
	RepoActivityViz,
	RuleCardGrid,
} from "../../components/rules/rule-card-grid";
import { RuleDropdown } from "../../components/rules/rule-dropdown";
import { RulesSaveBar } from "../../components/rules/rules-save-bar";
import { UserList } from "../../components/rules/user-list";
import { EmptyState } from "../../components/layout/empty-state";
import { toastManager } from "#/components/ui/toast";
import type { RuleConfig } from "#/db/schema";
import { env } from "#/env";
import { useTRPC } from "#/integrations/trpc/react";
import {
	areRuleConfigsEqual,
	getRuleConfigChanges,
	normalizeRuleConfig,
	revertRuleConfigChange,
} from "#/lib/rules/config-draft";
import { useWorkspace } from "#/lib/workspace-context";

export const Route = createFileRoute("/_app/rules")({
	component: RulesPage,
	pendingComponent: RulesPageSkeleton,
});

function RulesPageSkeleton() {
	return (
		<div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
			<div className="flex w-full items-start justify-between">
				<div className="flex flex-col gap-1">
					<div className="h-7 w-16 rounded bg-white/5" />
					<div className="h-4 w-40 rounded bg-white/5" />
				</div>
			</div>
			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
					<div key={i} className="h-[200px] w-full rounded-xl bg-white/5" />
				))}
			</div>
			<div className="h-24 w-full rounded-xl bg-white/5" />
			<div className="h-24 w-full rounded-xl bg-white/5" />
		</div>
	);
}

function RulesPage() {
	const { repo, repos, isLoading } = useWorkspace();
	const repoId = repo?.id;
	const trpc = useTRPC();
	const githubAppSlug = env.VITE_GITHUB_APP_SLUG ?? "tripwire-app";
	const queryClient = useQueryClient();
	const [draftConfig, setDraftConfig] = useState<RuleConfig | null>(null);
	const [showSavedState, setShowSavedState] = useState(false);

	const configQueryKey = trpc.rules.getConfig.queryKey({ repoId: repoId! });

	const configQuery = useQuery(
		trpc.rules.getConfig.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const serverConfig = normalizeRuleConfig(configQuery.data);
	const activeConfig = draftConfig ?? serverConfig;
	const changes = getRuleConfigChanges(serverConfig, activeConfig);
	const dirty = changes.length > 0;

	const updateConfig = useMutation(
		trpc.rules.updateConfig.mutationOptions({
			onError: (error) => {
				toastManager.add({
					title: "Failed to update rule",
					description: error.message || "Please try again",
					type: "error",
				});
			},
		}),
	);

	useEffect(() => {
		setDraftConfig(null);
		setShowSavedState(false);
	}, [repoId]);

	useEffect(() => {
		if (dirty) {
			setShowSavedState(false);
		}
	}, [dirty]);

	useEffect(() => {
		if (draftConfig && areRuleConfigsEqual(draftConfig, serverConfig)) {
			setDraftConfig(null);
		}
	}, [draftConfig, serverConfig]);

	useEffect(() => {
		if (!showSavedState) return;

		const timeout = window.setTimeout(() => {
			setShowSavedState(false);
		}, 1800);

		return () => window.clearTimeout(timeout);
	}, [showSavedState]);

	const leaveBlocker = useBlocker({
		shouldBlockFn: () => dirty,
		withResolver: true,
		disabled: !dirty,
	});

	useEffect(() => {
		if (leaveBlocker.status !== "blocked") return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				leaveBlocker.reset();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [leaveBlocker]);

	const toggleRule = useCallback(<K extends keyof RuleConfig>(key: K, enabled: boolean) => {
		if (updateConfig.isPending) return;

		setDraftConfig((currentDraft) => {
			const baseConfig = currentDraft ?? serverConfig;
			return normalizeRuleConfig({
				...baseConfig,
				[key]: enabled
					? { ...baseConfig[key], enabled: true }
					: { ...serverConfig[key], enabled: false },
			});
		});
	}, [serverConfig, updateConfig.isPending]);

	const updateRuleValue = useCallback(<K extends keyof RuleConfig>(
		key: K,
		patch: Partial<RuleConfig[K]>,
	) => {
		if (updateConfig.isPending) return;

		setDraftConfig((currentDraft) => {
			const baseConfig = currentDraft ?? serverConfig;
			return normalizeRuleConfig({
				...baseConfig,
				[key]: { ...baseConfig[key], ...patch },
			});
		});
	}, [serverConfig, updateConfig.isPending]);

	const handleSave = useCallback(async () => {
		if (!repoId || !dirty) return;

		try {
			const savedConfig = await updateConfig.mutateAsync({ repoId, config: activeConfig });
			queryClient.setQueryData(configQueryKey, savedConfig);
			setDraftConfig(null);
			setShowSavedState(true);
			void queryClient.invalidateQueries({ queryKey: configQueryKey });
		} catch {
			// Error state is surfaced via the mutation toast.
		}
	}, [activeConfig, configQueryKey, dirty, queryClient, repoId, updateConfig]);

	const handleDiscard = useCallback(() => {
		if (updateConfig.isPending) return;
		setDraftConfig(null);
		setShowSavedState(false);
	}, [updateConfig.isPending]);

	const handleRevert = useCallback((changeId: string) => {
		if (updateConfig.isPending) return;

		setDraftConfig((currentDraft) => {
			const baseConfig = currentDraft ?? serverConfig;
			return revertRuleConfigChange(serverConfig, baseConfig, changeId);
		});
	}, [serverConfig, updateConfig.isPending]);

	const whitelistQuery = useQuery(
		trpc.whitelist.list.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const whitelistUsers = (whitelistQuery.data ?? []).map((entry) => ({
		username: entry.githubUsername,
		avatarUrl: entry.avatarUrl ?? `https://github.com/${entry.githubUsername}.png`,
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

	const blacklistQuery = useQuery(
		trpc.blacklist.list.queryOptions(
			{ repoId: repoId! },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);

	const blacklistUsers = (blacklistQuery.data ?? []).map((entry) => ({
		username: entry.githubUsername,
		avatarUrl: entry.avatarUrl ?? `https://github.com/${entry.githubUsername}.png`,
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

	const activeCount = [
		activeConfig.aiSlopDetection.enabled,
		activeConfig.requireProfilePicture.enabled,
		activeConfig.languageRequirement.enabled,
		activeConfig.minMergedPrs.enabled,
		activeConfig.accountAge.enabled,
		activeConfig.maxPrsPerDay.enabled,
		activeConfig.maxFilesChanged.enabled,
		activeConfig.repoActivityMinimum.enabled,
		activeConfig.requireProfileReadme.enabled,
		activeConfig.cryptoAddressDetection.enabled,
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

	const isDataLoading =
		isLoading || configQuery.isLoading || whitelistQuery.isLoading || blacklistQuery.isLoading;
	if (isDataLoading) {
		return <RulesPageSkeleton />;
	}

	return (
		<div className="mx-auto flex w-full max-w-[1000px] flex-col gap-6 px-4 py-6 md:px-[50px] md:py-8">
			<div className="flex w-full items-start justify-between">
				<div className="flex flex-col gap-0.5">
					<h1 className="m-0 text-xl leading-[30px] font-medium tracking-[-0.02em] text-white md:text-2xl">
						Rules
					</h1>
					<p className="m-0 text-sm leading-[18px] text-[#FFFFFF73]">
						{activeCount} active
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
				<RuleCardGrid
					title="AI slop detection"
					description="Use known detection patterns to minimize automated activity"
					enabled={activeConfig.aiSlopDetection.enabled}
					action={activeConfig.aiSlopDetection.action}
					onToggle={(value) => toggleRule("aiSlopDetection", value)}
					onActionChange={(action) => updateRuleValue("aiSlopDetection", { action })}
					visualization={<AiSlopViz />}
				/>
				<RuleCardGrid
					title="Require profile picture"
					description="Require a custom profile picture instead of GitHub's fallback"
					enabled={activeConfig.requireProfilePicture.enabled}
					action={activeConfig.requireProfilePicture.action}
					onToggle={(value) => toggleRule("requireProfilePicture", value)}
					onActionChange={(action) => updateRuleValue("requireProfilePicture", { action })}
					visualization={<ProfilePictureViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							Require all contributions in{" "}
							<RuleDropdown
								value={activeConfig.languageRequirement.language}
								options={LANGUAGE_OPTIONS}
								onChange={(language) => updateRuleValue("languageRequirement", { language })}
							/>
						</>
					)}
					description="Contributions in a disallowed language will be declined"
					enabled={activeConfig.languageRequirement.enabled}
					action={activeConfig.languageRequirement.action}
					onToggle={(value) => toggleRule("languageRequirement", value)}
					onActionChange={(action) => updateRuleValue("languageRequirement", { action })}
					visualization={<LanguageViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							At least{" "}
							<RuleDropdown
								value={String(activeConfig.minMergedPrs.count)}
								options={PR_COUNT_OPTIONS}
								onChange={(value) => updateRuleValue("minMergedPrs", { count: Number(value) })}
							/>{" "}
							merged PRs
						</>
					)}
					description="Minimum merged pull requests before they can contribute"
					enabled={activeConfig.minMergedPrs.enabled}
					action={activeConfig.minMergedPrs.action}
					onToggle={(value) => toggleRule("minMergedPrs", value)}
					onActionChange={(action) => updateRuleValue("minMergedPrs", { action })}
					visualization={<MergedPrsViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							Account older than{" "}
							<RuleDropdown
								value={`${activeConfig.accountAge.days} days`}
								options={ACCOUNT_AGE_OPTIONS}
								onChange={(value) =>
									updateRuleValue("accountAge", { days: Number.parseInt(value, 10) })}
							/>
						</>
					)}
					description="Block accounts created too recently from contributing"
					enabled={activeConfig.accountAge.enabled}
					action={activeConfig.accountAge.action}
					onToggle={(value) => toggleRule("accountAge", value)}
					onActionChange={(action) => updateRuleValue("accountAge", { action })}
					visualization={<AccountAgeViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							Max{" "}
							<RuleDropdown
								value={String(activeConfig.maxPrsPerDay.limit)}
								options={MAX_PRS_PER_DAY_OPTIONS}
								onChange={(value) => updateRuleValue("maxPrsPerDay", { limit: Number(value) })}
							/>{" "}
							PRs per day
						</>
					)}
					description="Rate limit how many PRs or issues a single user can open per day"
					enabled={activeConfig.maxPrsPerDay.enabled}
					action={activeConfig.maxPrsPerDay.action}
					onToggle={(value) => toggleRule("maxPrsPerDay", value)}
					onActionChange={(action) => updateRuleValue("maxPrsPerDay", { action })}
					visualization={<MaxPrsPerDayViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							Max{" "}
							<RuleDropdown
								value={String(activeConfig.maxFilesChanged.limit)}
								options={MAX_FILES_CHANGED_OPTIONS}
								onChange={(value) => updateRuleValue("maxFilesChanged", { limit: Number(value) })}
							/>{" "}
							files changed
						</>
					)}
					description="Block pull requests that touch too many files in a single submission"
					enabled={activeConfig.maxFilesChanged.enabled}
					action={activeConfig.maxFilesChanged.action}
					onToggle={(value) => toggleRule("maxFilesChanged", value)}
					onActionChange={(action) => updateRuleValue("maxFilesChanged", { action })}
					visualization={<MaxFilesChangedViz />}
				/>
				<RuleCardGrid
					title={(
						<>
							At least{" "}
							<RuleDropdown
								value={String(activeConfig.repoActivityMinimum.minRepos)}
								options={REPO_ACTIVITY_OPTIONS}
								onChange={(value) =>
									updateRuleValue("repoActivityMinimum", { minRepos: Number(value) })}
							/>{" "}
							public repos
						</>
					)}
					description="Contributor must have meaningful activity across other public repos"
					enabled={activeConfig.repoActivityMinimum.enabled}
					action={activeConfig.repoActivityMinimum.action}
					onToggle={(value) => toggleRule("repoActivityMinimum", value)}
					onActionChange={(action) => updateRuleValue("repoActivityMinimum", { action })}
					visualization={<RepoActivityViz />}
				/>
				<RuleCardGrid
					title="Require profile README"
					description="Contributors must have a profile README on their GitHub account"
					enabled={activeConfig.requireProfileReadme.enabled}
					action={activeConfig.requireProfileReadme.action}
					onToggle={(value) => toggleRule("requireProfileReadme", value)}
					onActionChange={(action) => updateRuleValue("requireProfileReadme", { action })}
					visualization={<ProfileReadmeViz />}
				/>
				<RuleCardGrid
					title="Crypto address detection"
					description="Block content containing cryptocurrency wallet addresses (BTC, ETH, SOL, XMR, DASH)"
					enabled={activeConfig.cryptoAddressDetection.enabled}
					action={activeConfig.cryptoAddressDetection.action}
					onToggle={(value) => toggleRule("cryptoAddressDetection", value)}
					onActionChange={(action) => updateRuleValue("cryptoAddressDetection", { action })}
					visualization={<CryptoViz />}
				/>
			</div>

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

			<RulesSaveBar
				dirty={dirty}
				saving={updateConfig.isPending}
				saved={showSavedState}
				changes={changes}
				onSave={() => {
					void handleSave();
				}}
				onDiscard={handleDiscard}
				onRevert={handleRevert}
			/>

			<AnimatePresence>
				{leaveBlocker.status === "blocked" ? (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
						className="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(7,7,9,0.64)] p-4 backdrop-blur-[2px] sm:items-center"
						onClick={() => leaveBlocker.reset()}
					>
						<motion.div
							initial={{ opacity: 0, y: 14, scale: 0.985 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: 10, scale: 0.985 }}
							transition={{ type: "spring", stiffness: 340, damping: 28, mass: 0.82 }}
							className="w-full max-w-[360px] rounded-2xl bg-tw-card p-1.5"
							style={{ boxShadow: "0 8px 24px #00000040, 0 1px 2px #0000001a" }}
							onClick={(event) => event.stopPropagation()}
						>
							<div className="flex items-start justify-between gap-3 px-3.5 py-3">
								<div>
									<h2 className="text-[15px] leading-5 font-medium text-tw-text-primary">
										Leave without saving?
									</h2>
									<p className="mt-1 text-[13px] leading-5 text-tw-text-secondary">
										Unsaved rule changes will be lost.
									</p>
								</div>
							</div>
							<div className="flex items-center justify-end gap-1.5 border-t border-white/[0.05] px-1.5 pt-1.5">
								<button
									type="button"
									onClick={() => leaveBlocker.reset()}
									className="inline-flex h-8 items-center rounded-[10px] px-3 text-[12px] font-medium text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
								>
									Stay
								</button>
								<button
									type="button"
									onClick={() => leaveBlocker.proceed()}
									className="inline-flex h-8 items-center rounded-[10px] bg-[#363639] px-3 text-[12px] font-medium text-tw-text-primary transition-colors hover:bg-[#404044]"
								>
									Leave
								</button>
							</div>
						</motion.div>
					</motion.div>
				) : null}
			</AnimatePresence>
		</div>
	);
}
