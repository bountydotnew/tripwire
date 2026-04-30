import { useCallback, useEffect, useState } from "react";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	AccountAgeViz,
	AiSlopViz,
	CryptoViz,
	LanguageViz,
	MaxFilesChangedViz,
	MaxPrsPerDayViz,
	MergedPrsViz,
ProfileReadmeViz,
	RepoActivityViz,
	RuleCardGrid,
} from "../../components/rules/rule-card-grid";
import { RuleDropdown } from "../../components/rules/rule-dropdown";
import { RulesSaveBar } from "../../components/rules/rules-save-bar";
import { PeopleTab } from "../../components/rules/people-tab";
import { EmptyState } from "../../components/layout/empty-state";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
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

	const [tab, setTab] = useState<"marketplace" | "installed" | "people">("marketplace");
	const [searchQuery, setSearchQuery] = useState("");

	const activeCount = [
		activeConfig.aiSlopDetection.enabled,
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

	// Build rule list for filtering
	const allRules = [
		{ key: "aiSlopDetection" as const, title: "AI slop detection", searchable: "ai slop detection automated" },
{ key: "languageRequirement" as const, title: "Language requirement", searchable: "language requirement english" },
		{ key: "minMergedPrs" as const, title: "Minimum merged PRs", searchable: "minimum merged prs pull requests" },
		{ key: "accountAge" as const, title: "Account age", searchable: "account age days old new" },
		{ key: "maxPrsPerDay" as const, title: "Max PRs per day", searchable: "max prs per day rate limit" },
		{ key: "maxFilesChanged" as const, title: "Max files changed", searchable: "max files changed" },
		{ key: "repoActivityMinimum" as const, title: "Repo activity minimum", searchable: "repo activity minimum public repos" },
		{ key: "requireProfileReadme" as const, title: "Require profile README", searchable: "require profile readme" },
		{ key: "cryptoAddressDetection" as const, title: "Crypto address detection", searchable: "crypto address detection bitcoin ethereum" },
	];

	const q = searchQuery.toLowerCase();
	const matchesSearch = (r: typeof allRules[number]) =>
		!q || r.searchable.includes(q) || r.title.toLowerCase().includes(q);

	const installedRuleKeys = allRules.filter((r) => activeConfig[r.key].enabled);
	const availableRuleKeys = allRules.filter((r) => !activeConfig[r.key].enabled);

	return (
		<div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 md:px-[50px] md:py-10">
			<div className="grid grid-cols-[180px_1fr] gap-6">
				{/* Side column */}
				<div className="flex flex-col gap-4 pt-1">
					<div>
						<h1 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.02em] text-white">Rules</h1>
						<p className="m-0 text-[13px] text-[#FFFFFF73] mt-0.5">{activeCount} active</p>
					</div>
					<nav className="flex flex-col gap-0.5 -mx-1.5">
						<button
							type="button"
							onClick={() => setTab("marketplace")}
							className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "marketplace" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 4v7h10V4M1 4h12l-1-2H2L1 4ZM5 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
							Marketplace
						</button>
						<button
							type="button"
							onClick={() => setTab("installed")}
							className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "installed" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<span className="flex items-center gap-2">
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4.5 7.2l1.8 1.8 3.2-3.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								Installed
							</span>
							<span className="text-[11px] text-[#FFFFFF59] tabular-nums">{activeCount}</span>
						</button>
						<button
							type="button"
							onClick={() => setTab("people")}
							className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "people" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 12c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
							People
						</button>
					</nav>
				</div>

				{/* Main column */}
				<div className="flex flex-col gap-4 min-w-0">
					{/* Search bar */}
					{tab !== "people" && (
						<div className="flex items-center gap-2 h-9 rounded-[10px] bg-tw-card px-2.5">
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#6E6E6E" strokeWidth="1.2"/><path d="M9.5 9.5L12.5 12.5" stroke="#6E6E6E" strokeWidth="1.2" strokeLinecap="round"/></svg>
							<input
								value={searchQuery}
								onChange={(e) => setSearchQuery(e.target.value)}
								placeholder={tab === "marketplace" ? "Search all rules" : "Search installed rules"}
								className="flex-1 bg-transparent outline-none text-[13px] text-white placeholder:text-[#6E6E6E]"
							/>
						</div>
					)}

					{/* Marketplace tab: all rules */}
					{tab === "marketplace" && (
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
					)}

					{/* Installed tab: only enabled rules */}
					{tab === "installed" && (
						installedRuleKeys.filter(matchesSearch).length === 0 ? (
							<div className="rounded-xl bg-tw-card p-6 text-center">
								<p className="text-[13px] text-[#FFFFFF73]">
									{searchQuery ? "No installed rules match your search." : "No rules installed yet. Browse the marketplace to get started."}
								</p>
							</div>
						) : (
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
								{/* Same cards but filtered to enabled only — reuse the same JSX pattern */}
								{activeConfig.aiSlopDetection.enabled && matchesSearch(allRules[0]) && (
									<RuleCardGrid title="AI slop detection" description="Use known detection patterns to minimize automated activity" enabled={true} action={activeConfig.aiSlopDetection.action} onToggle={(v) => toggleRule("aiSlopDetection", v)} onActionChange={(a) => updateRuleValue("aiSlopDetection", { action: a })} visualization={<AiSlopViz />} />
								)}
								{activeConfig.languageRequirement.enabled && matchesSearch(allRules[1]) && (
									<RuleCardGrid title={<>Require all contributions in{" "}<RuleDropdown value={activeConfig.languageRequirement.language} options={LANGUAGE_OPTIONS} onChange={(language) => updateRuleValue("languageRequirement", { language })} /></>} description="Contributions in a disallowed language will be declined" enabled={true} action={activeConfig.languageRequirement.action} onToggle={(v) => toggleRule("languageRequirement", v)} onActionChange={(a) => updateRuleValue("languageRequirement", { action: a })} visualization={<LanguageViz />} />
								)}
								{activeConfig.minMergedPrs.enabled && matchesSearch(allRules[2]) && (
									<RuleCardGrid title={<>At least{" "}<RuleDropdown value={String(activeConfig.minMergedPrs.count)} options={PR_COUNT_OPTIONS} onChange={(v) => updateRuleValue("minMergedPrs", { count: Number(v) })} />{" "}merged PRs</>} description="Minimum merged pull requests before they can contribute" enabled={true} action={activeConfig.minMergedPrs.action} onToggle={(v) => toggleRule("minMergedPrs", v)} onActionChange={(a) => updateRuleValue("minMergedPrs", { action: a })} visualization={<MergedPrsViz />} />
								)}
								{activeConfig.accountAge.enabled && matchesSearch(allRules[3]) && (
									<RuleCardGrid title={<>Account older than{" "}<RuleDropdown value={`${activeConfig.accountAge.days} days`} options={ACCOUNT_AGE_OPTIONS} onChange={(v) => updateRuleValue("accountAge", { days: Number.parseInt(v, 10) })} /></>} description="Block accounts created too recently from contributing" enabled={true} action={activeConfig.accountAge.action} onToggle={(v) => toggleRule("accountAge", v)} onActionChange={(a) => updateRuleValue("accountAge", { action: a })} visualization={<AccountAgeViz />} />
								)}
								{activeConfig.maxPrsPerDay.enabled && matchesSearch(allRules[4]) && (
									<RuleCardGrid title={<>Max{" "}<RuleDropdown value={String(activeConfig.maxPrsPerDay.limit)} options={MAX_PRS_PER_DAY_OPTIONS} onChange={(v) => updateRuleValue("maxPrsPerDay", { limit: Number(v) })} />{" "}PRs per day</>} description="Rate limit how many PRs or issues a single user can open per day" enabled={true} action={activeConfig.maxPrsPerDay.action} onToggle={(v) => toggleRule("maxPrsPerDay", v)} onActionChange={(a) => updateRuleValue("maxPrsPerDay", { action: a })} visualization={<MaxPrsPerDayViz />} />
								)}
								{activeConfig.maxFilesChanged.enabled && matchesSearch(allRules[5]) && (
									<RuleCardGrid title={<>Max{" "}<RuleDropdown value={String(activeConfig.maxFilesChanged.limit)} options={MAX_FILES_CHANGED_OPTIONS} onChange={(v) => updateRuleValue("maxFilesChanged", { limit: Number(v) })} />{" "}files changed</>} description="Block pull requests that touch too many files in a single submission" enabled={true} action={activeConfig.maxFilesChanged.action} onToggle={(v) => toggleRule("maxFilesChanged", v)} onActionChange={(a) => updateRuleValue("maxFilesChanged", { action: a })} visualization={<MaxFilesChangedViz />} />
								)}
								{activeConfig.repoActivityMinimum.enabled && matchesSearch(allRules[6]) && (
									<RuleCardGrid title={<>At least{" "}<RuleDropdown value={String(activeConfig.repoActivityMinimum.minRepos)} options={REPO_ACTIVITY_OPTIONS} onChange={(v) => updateRuleValue("repoActivityMinimum", { minRepos: Number(v) })} />{" "}public repos</>} description="Contributor must have meaningful activity across other public repos" enabled={true} action={activeConfig.repoActivityMinimum.action} onToggle={(v) => toggleRule("repoActivityMinimum", v)} onActionChange={(a) => updateRuleValue("repoActivityMinimum", { action: a })} visualization={<RepoActivityViz />} />
								)}
								{activeConfig.requireProfileReadme.enabled && matchesSearch(allRules[7]) && (
									<RuleCardGrid title="Require profile README" description="Contributors must have a profile README on their GitHub account" enabled={true} action={activeConfig.requireProfileReadme.action} onToggle={(v) => toggleRule("requireProfileReadme", v)} onActionChange={(a) => updateRuleValue("requireProfileReadme", { action: a })} visualization={<ProfileReadmeViz />} />
								)}
								{activeConfig.cryptoAddressDetection.enabled && matchesSearch(allRules[8]) && (
									<RuleCardGrid title="Crypto address detection" description="Block content containing cryptocurrency wallet addresses (BTC, ETH, SOL, XMR, DASH)" enabled={true} action={activeConfig.cryptoAddressDetection.action} onToggle={(v) => toggleRule("cryptoAddressDetection", v)} onActionChange={(a) => updateRuleValue("cryptoAddressDetection", { action: a })} visualization={<CryptoViz />} />
								)}
							</div>
						)
					)}

					{/* People tab: always block + always allow */}
					{tab === "people" && (
						<PeopleTab
							blacklistUsers={blacklistUsers.map((u) => ({
								...u,
								reason: null,
								addedBy: null,
								addedAt: null,
							}))}
							whitelistUsers={whitelistUsers.map((u) => ({
								...u,
								reason: null,
								addedBy: null,
								addedAt: null,
							}))}
							onAddBlacklist={async (username) => {
								if (repoId) await addBlacklist.mutateAsync({ repoId, githubUsername: username });
							}}
							onRemoveBlacklist={(username) => {
								if (repoId) removeBlacklist.mutate({ repoId, githubUsername: username });
							}}
							onAddWhitelist={async (username) => {
								if (repoId) await addWhitelist.mutateAsync({ repoId, githubUsername: username });
							}}
							onRemoveWhitelist={(username) => {
								if (repoId) removeWhitelist.mutate({ repoId, githubUsername: username });
							}}
							isAddingBlacklist={addBlacklist.isPending}
							isAddingWhitelist={addWhitelist.isPending}
						/>
					)}
				</div>
			</div>

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

			<Dialog
				open={leaveBlocker.status === "blocked"}
				onOpenChange={(open) => {
					if (!open) {
						leaveBlocker.reset?.();
					}
				}}
			>
				<DialogContent
					showCloseButton={false}
					className="w-full max-w-[360px] border-transparent bg-tw-card p-0"
				>
					<DialogHeader className="px-5 py-4">
						<DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
							Leave without saving?
						</DialogTitle>
						<DialogDescription className="text-[13px] leading-5 text-tw-text-secondary">
							Unsaved rule changes will be lost.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter
						className="gap-1.5 border-t border-white/[0.05] bg-transparent px-2 py-2"
						variant="default"
					>
						<button
							type="button"
							onClick={() => leaveBlocker.reset?.()}
							className="inline-flex h-8 items-center rounded-[10px] px-3 text-[12px] font-medium text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
						>
							Stay
						</button>
						<Button
							size="sm"
							variant="destructive"
							onClick={() => leaveBlocker.proceed?.()}
							className="h-8 rounded-[10px] px-3 text-[12px] font-medium"
						>
							Leave
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}
