import { useCallback, useEffect, useMemo, useState } from "react";
import { authClient } from "@tripwire/auth/client";
import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseAsBoolean, parseAsString, parseAsStringEnum, useQueryState, useQueryStates } from "nuqs";
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
	VouchedUsersViz,
} from "#/components/rules/rule-card-grid";
import { RulesSaveBar } from "#/components/rules/rules-save-bar";
import { PeopleTab } from "#/components/rules/people-tab";
import { EmptyState } from "#/components/layout/empty-state";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { RepoFilesTree } from "#/components/rules/repo-files-tree";
import { toastFromError } from "#/lib/toast-error";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { toastManager } from "#/components/ui/toast";
import type { RuleConfig } from "@tripwire/db";
import { env } from "@tripwire/env/client";
import { useTRPC } from "#/integrations/trpc/react";
// Narrow subpath: avoids pulling the server-only events/reputation/filter
// modules (which transitively reach the live db client).
import {
	areRuleConfigsEqual,
	getRuleConfigChanges,
	normalizeRuleConfig,
	revertRuleConfigChange,
} from "@tripwire/core/rules/config-draft";
// Pull from the narrow subpath — main entry pulls server-only crypto helpers
// (Buffer, node:fs via dotenv) that would break the client bundle.
import {
	generateHoneypotPhraseOfKind,
	generatePrTemplate,
	generateRulesMd,
	generateAgentsMd,
} from "@tripwire/github/repo-files";
import { useWorkspace } from "#/lib/workspace-context";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/$orgHandle/rules")({
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
	const { data: session } = authClient.useSession();
	const isAdmin = session?.user?.role === "admin";
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

	const serverConfig = useMemo(
		() => normalizeRuleConfig(configQuery.data),
		[configQuery.data],
	);
	const activeConfig = draftConfig ?? serverConfig;
	const changes = getRuleConfigChanges(serverConfig, activeConfig);
	const dirty = changes.length > 0;

	const updateConfig = useMutation(
		trpc.rules.updateConfig.mutationOptions({
			onError: (err) => toastFromError(err, { fallbackTitle: "Failed to update rule" }),
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

	const updateRepoFileContent = useCallback(
		(kind: "rules-md" | "pr-template" | "agents-md", content: string) => {
			if (updateConfig.isPending) return;
			setDraftConfig((currentDraft) => {
				const baseConfig = currentDraft ?? serverConfig;
				const repoFiles =
					kind === "rules-md"
						? {
								...baseConfig.repoFiles,
								rulesMd: { ...baseConfig.repoFiles.rulesMd, customContent: content },
							}
						: kind === "agents-md"
							? {
									...baseConfig.repoFiles,
									agentsMd: { ...baseConfig.repoFiles.agentsMd, customContent: content },
								}
							: {
									...baseConfig.repoFiles,
									prTemplate: { ...baseConfig.repoFiles.prTemplate, customContent: content },
								};
				return normalizeRuleConfig({ ...baseConfig, repoFiles });
			});
		},
		[serverConfig, updateConfig.isPending],
	);

	const toggleScope = useCallback((field: "pullRequests" | "issues" | "comments", value: boolean) => {
		if (updateConfig.isPending) return;
		setDraftConfig((currentDraft) => {
			const baseConfig = currentDraft ?? serverConfig;
			return normalizeRuleConfig({
				...baseConfig,
				contentScope: { ...baseConfig.contentScope, [field]: value },
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

	const suggestedQuery = useQuery({
		...trpc.whitelist.suggestedContributors.queryOptions({ repoId: repoId! }),
		enabled: !!repoId,
		staleTime: 5 * 60 * 1000,
	});

	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringEnum([
			"marketplace",
			"installed",
			"people",
			"requests",
			"files",
			"workflows",
		] as const).withDefault("marketplace"),
	);
	const [searchQuery, setSearchQuery] = useState("");

	// Clear the file param when navigating away from the files tab
	const [, setFileParam] = useQueryState("file");
	useEffect(() => {
		if (tab !== "files") {
			setFileParam(null);
		}
	}, [tab, setFileParam]);

	const [{ rule: configureRule, configure: configureFlag }, setConfigureParams] = useQueryStates({
		rule: parseAsString,
		configure: parseAsBoolean.withDefault(false),
	});

	const ruleConfigureProps = useCallback(
		(key: keyof RuleConfig) => {
			const rule = activeConfig[key];
			const scopeOverride =
				rule && typeof rule === "object" && "scopeOverride" in rule
					? (rule.scopeOverride as
							| { pullRequests?: boolean; issues?: boolean; comments?: boolean }
							| undefined)
					: undefined;
			return {
				configureOpen: configureFlag && configureRule === key,
				onConfigureOpenChange: (open: boolean) =>
					setConfigureParams(open ? { rule: key, configure: true } : { rule: null, configure: false }),
				globalScope: activeConfig.contentScope,
				scopeOverride,
				onScopeOverrideChange: (
					next:
						| { pullRequests?: boolean; issues?: boolean; comments?: boolean }
						| undefined,
				) => updateRuleValue(key, { scopeOverride: next } as never),
			};
		},
		[activeConfig, configureFlag, configureRule, setConfigureParams, updateRuleValue],
	);

	const requestsQuery = useQuery(
		trpc.requests.list.queryOptions(
			{ repoId: repoId!, status: "pending" },
			{ enabled: !!repoId, staleTime: 30 * 1000 },
		),
	);
	const pendingRequestCount = requestsQuery.data?.length ?? 0;

	const vouchRequestsQuery = useQuery(
		trpc.vouches.listRequests.queryOptions(
			{ status: "pending" },
			{ staleTime: 30 * 1000 },
		),
	);
	const pendingVouchCount = vouchRequestsQuery.data?.length ?? 0;

	const decideVouchRequest = useMutation(
		trpc.vouches.decideRequest.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: trpc.vouches.listRequests.queryKey() });
			},
			onError: (err) => toastFromError(err, { fallbackTitle: "Failed to decide vouch request" }),
		}),
	);

	const addHoneypotPhrase = useCallback(
		(target: "prTemplate" | "agentsMd", kind: "codeword" | "marker" | "natural" | "tag") => {
			if (updateConfig.isPending) return;
			const newPhrase = generateHoneypotPhraseOfKind(kind);
			setDraftConfig((currentDraft) => {
				const baseConfig = currentDraft ?? serverConfig;
				return normalizeRuleConfig({
					...baseConfig,
					repoFiles: {
						...baseConfig.repoFiles,
						[target]: {
							...baseConfig.repoFiles[target],
							honeypotPhrases: [
								...baseConfig.repoFiles[target].honeypotPhrases,
								newPhrase,
							],
							customContent: "",
						},
					},
				});
			});
		},
		[serverConfig, updateConfig.isPending],
	);

	const removeHoneypotPhrase = useCallback(
		(target: "prTemplate" | "agentsMd", index: number) => {
			if (updateConfig.isPending) return;
			setDraftConfig((currentDraft) => {
				const baseConfig = currentDraft ?? serverConfig;
				return normalizeRuleConfig({
					...baseConfig,
					repoFiles: {
						...baseConfig.repoFiles,
						[target]: {
							...baseConfig.repoFiles[target],
							honeypotPhrases: baseConfig.repoFiles[target].honeypotPhrases.filter(
								(_, i) => i !== index,
							),
						},
					},
				});
			});
		},
		[serverConfig, updateConfig.isPending],
	);

	const toggleRepoFile = useCallback(
		(path: string, value: boolean) => {
			if (updateConfig.isPending) return;
			setDraftConfig((currentDraft) => {
				const baseConfig = currentDraft ?? serverConfig;
				const repoFiles = baseConfig.repoFiles;
				let nextRepoFiles;
				switch (path) {
					case "rulesMd.autoSync":
						nextRepoFiles = { ...repoFiles, rulesMd: { ...repoFiles.rulesMd, autoSync: value } };
						break;
					case "prTemplate.autoSync":
						nextRepoFiles = { ...repoFiles, prTemplate: { ...repoFiles.prTemplate, autoSync: value } };
						break;
					case "prTemplate.honeypotEnabled":
						nextRepoFiles = { ...repoFiles, prTemplate: { ...repoFiles.prTemplate, honeypotEnabled: value } };
						break;
					case "agentsMd.autoSync":
						nextRepoFiles = { ...repoFiles, agentsMd: { ...repoFiles.agentsMd, autoSync: value } };
						break;
					case "agentsMd.honeypotEnabled":
						nextRepoFiles = { ...repoFiles, agentsMd: { ...repoFiles.agentsMd, honeypotEnabled: value } };
						break;
					default:
						nextRepoFiles = repoFiles;
				}
				return normalizeRuleConfig({ ...baseConfig, repoFiles: nextRepoFiles });
			});
		},
		[serverConfig, updateConfig.isPending],
	);

	const decideRequest = useMutation(
		trpc.requests.decide.mutationOptions({
			onSuccess: (_, vars) => {
				toastManager.add({
					title: vars.decision === "approve" ? "Request approved" : "Request denied",
					type: "success",
				});
				queryClient.invalidateQueries({
					queryKey: trpc.requests.list.queryKey({ repoId: repoId!, status: "pending" }),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.whitelist.list.queryKey({ repoId: repoId! }),
				});
				queryClient.invalidateQueries({
					queryKey: trpc.blacklist.list.queryKey({ repoId: repoId! }),
				});
			},
			onError: (e) => toastFromError(e, { fallbackTitle: "Action failed" }),
		}),
	);

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
		activeConfig.vouchedUsersOnly.enabled,
		activeConfig.aiHoneypot.enabled,
	].filter(Boolean).length;

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
		{ key: "vouchedUsersOnly" as const, title: "Vouched users only", searchable: "vouched users whitelist allowlist trusted contributors" },
		{ key: "aiHoneypot" as const, title: "AI honeypot", searchable: "ai honeypot agent llm detection bot" },
	];

	const q = searchQuery.toLowerCase();
	const matchesSearch = (r: typeof allRules[number]) =>
		!q || r.searchable.includes(q) || r.title.toLowerCase().includes(q);

	const installedRuleKeys = allRules.filter((r) => activeConfig[r.key].enabled);

	return (
		<div className="mx-auto flex w-full max-w-[1080px] flex-col gap-6 px-4 py-8 md:px-[50px] md:py-10">
			<div className="grid grid-cols-[180px_1fr] gap-6 items-start">
				{/* Side column */}
				<div className="flex flex-col gap-4 pt-1 sticky top-4 self-start max-h-[calc(100vh-2rem)] overflow-y-auto">
					<div>
						<h1 className="m-0 text-[22px] leading-[28px] font-semibold tracking-[-0.02em] text-white">Rules</h1>
						<p className="m-0 text-[13px] text-[#FFFFFF73] mt-0.5">{activeCount} active</p>
					</div>

					<div className="flex flex-col gap-1.5">
						<div className="text-[11px] uppercase tracking-wide text-[#FFFFFF59]">Watching</div>
						{(
							[
								{ key: "pullRequests" as const, label: "Pull requests" },
								{ key: "issues" as const, label: "Issues" },
								{ key: "comments" as const, label: "Comments" },
							]
						).map(({ key, label }) => {
							const checked = activeConfig.contentScope[key];
							return (
								<label
									key={key}
									className="flex items-center gap-2 text-[13px] text-[#FFFFFFCC] cursor-pointer select-none -mx-1 px-1 py-0.5 rounded hover:bg-[#ffffff08]"
								>
									<Checkbox
										checked={checked}
										onCheckedChange={(value) => toggleScope(key, value === true)}
									/>
									{label}
								</label>
							);
						})}
						{!activeConfig.contentScope.pullRequests &&
						!activeConfig.contentScope.issues &&
						!activeConfig.contentScope.comments ? (
							<p className="m-0 mt-1 text-[11px] text-amber-300/80 leading-snug">
								Tripwire isn't watching anything — rules won't run.
							</p>
						) : null}
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
						<button
							type="button"
							onClick={() => setTab("requests")}
							className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "requests" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<span className="flex items-center gap-2">
								<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 3h8v6H6.5L4 11V9H3V3Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
								Requests
							</span>
							{(pendingRequestCount + pendingVouchCount) > 0 && (
								<span className="text-[11px] text-tw-accent tabular-nums">{pendingRequestCount + pendingVouchCount}</span>
							)}
						</button>
						<button
							type="button"
							onClick={() => setTab("files")}
							className={`flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "files" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3 1.5h5l3 3v8h-8v-11Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/><path d="M8 1.5v3h3" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>
							Files
						</button>
						<button
							type="button"
							onClick={() => setTab("workflows")}
							className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors ${tab === "workflows" ? "bg-tw-card text-white" : "text-[#FFFFFF99] hover:bg-[#ffffff08]"}`}
						>
							<span className="flex items-center gap-2">
								<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8.5 1.5a1 1 0 0 0-1.8-.6L2.6 7.4a1 1 0 0 0 .8 1.6h3.1l-1 5.5a1 1 0 0 0 1.8.6l4.1-6.5a1 1 0 0 0-.8-1.6H7.5l1-5.5Z" fill="currentColor"/></svg>
								Workflows
							</span>
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
					modalTitle="AI slop detection"
					description="Use known detection patterns to minimize automated activity"
					enabled={activeConfig.aiSlopDetection.enabled}
					action={activeConfig.aiSlopDetection.action}
					onToggle={(value) => toggleRule("aiSlopDetection", value)}
					onActionChange={(action) => updateRuleValue("aiSlopDetection", { action })}
					visualization={<AiSlopViz />}
					comingSoon
					{...ruleConfigureProps("aiSlopDetection")}
				/>
				<RuleCardGrid
					title={`Require contributions in ${activeConfig.languageRequirement.language}`}
					modalTitle="Language requirement"
					description="Contributions in a disallowed language will be declined"
					enabled={activeConfig.languageRequirement.enabled}
					action={activeConfig.languageRequirement.action}
					onToggle={(value) => toggleRule("languageRequirement", value)}
					onActionChange={(action) => updateRuleValue("languageRequirement", { action })}
					visualization={<LanguageViz />}
					{...ruleConfigureProps("languageRequirement")}
				/>
				<RuleCardGrid
					title={`At least ${activeConfig.minMergedPrs.count} merged PRs`}
					modalTitle="Minimum merged PRs"
					description="Minimum merged pull requests before they can contribute"
					enabled={activeConfig.minMergedPrs.enabled}
					action={activeConfig.minMergedPrs.action}
					onToggle={(value) => toggleRule("minMergedPrs", value)}
					onActionChange={(action) => updateRuleValue("minMergedPrs", { action })}
					visualization={<MergedPrsViz />}
					numericConfig={{
						value: activeConfig.minMergedPrs.count,
						label: "Minimum merged PRs",
						onChange: (count) => updateRuleValue("minMergedPrs", { count }),
					}}
					{...ruleConfigureProps("minMergedPrs")}
				/>
				<RuleCardGrid
					title={`Account older than ${activeConfig.accountAge.days} days`}
					modalTitle="Account age requirement"
					description="Block accounts created too recently from contributing"
					enabled={activeConfig.accountAge.enabled}
					action={activeConfig.accountAge.action}
					onToggle={(value) => toggleRule("accountAge", value)}
					onActionChange={(action) => updateRuleValue("accountAge", { action })}
					visualization={<AccountAgeViz />}
					numericConfig={{
						value: activeConfig.accountAge.days,
						label: "Minimum account age (days)",
						onChange: (days) => updateRuleValue("accountAge", { days }),
					}}
					{...ruleConfigureProps("accountAge")}
				/>
				<RuleCardGrid
					title={`Max ${activeConfig.maxPrsPerDay.limit} PRs per day`}
					modalTitle="Max PRs per day"
					description="Rate limit how many PRs or issues a single user can open per day"
					enabled={activeConfig.maxPrsPerDay.enabled}
					action={activeConfig.maxPrsPerDay.action}
					onToggle={(value) => toggleRule("maxPrsPerDay", value)}
					onActionChange={(action) => updateRuleValue("maxPrsPerDay", { action })}
					visualization={<MaxPrsPerDayViz />}
					numericConfig={{
						value: activeConfig.maxPrsPerDay.limit,
						label: "Maximum PRs per day",
						onChange: (limit) => updateRuleValue("maxPrsPerDay", { limit }),
					}}
					{...ruleConfigureProps("maxPrsPerDay")}
				/>
				<RuleCardGrid
					title={`Max ${activeConfig.maxFilesChanged.limit} files changed`}
					modalTitle="Max files changed"
					description="Block pull requests that touch too many files in a single submission"
					enabled={activeConfig.maxFilesChanged.enabled}
					action={activeConfig.maxFilesChanged.action}
					onToggle={(value) => toggleRule("maxFilesChanged", value)}
					onActionChange={(action) => updateRuleValue("maxFilesChanged", { action })}
					visualization={<MaxFilesChangedViz />}
					numericConfig={{
						value: activeConfig.maxFilesChanged.limit,
						label: "Maximum files changed",
						onChange: (limit) => updateRuleValue("maxFilesChanged", { limit }),
					}}
					{...ruleConfigureProps("maxFilesChanged")}
				/>
				<RuleCardGrid
					title={`At least ${activeConfig.repoActivityMinimum.minRepos} public repos`}
					modalTitle="Repo activity minimum"
					description="Contributor must have meaningful activity across other public repos"
					enabled={activeConfig.repoActivityMinimum.enabled}
					action={activeConfig.repoActivityMinimum.action}
					onToggle={(value) => toggleRule("repoActivityMinimum", value)}
					onActionChange={(action) => updateRuleValue("repoActivityMinimum", { action })}
					visualization={<RepoActivityViz />}
					numericConfig={{
						value: activeConfig.repoActivityMinimum.minRepos,
						label: "Minimum public repos",
						onChange: (minRepos) => updateRuleValue("repoActivityMinimum", { minRepos }),
					}}
					{...ruleConfigureProps("repoActivityMinimum")}
				/>
				<RuleCardGrid
					title="Require profile README"
					modalTitle="Require profile README"
					description="Contributors must have a profile README on their GitHub account"
					enabled={activeConfig.requireProfileReadme.enabled}
					action={activeConfig.requireProfileReadme.action}
					onToggle={(value) => toggleRule("requireProfileReadme", value)}
					onActionChange={(action) => updateRuleValue("requireProfileReadme", { action })}
					visualization={<ProfileReadmeViz />}
					{...ruleConfigureProps("requireProfileReadme")}
				/>
				<RuleCardGrid
					title="Crypto address detection"
					modalTitle="Crypto address detection"
					description="Block content containing cryptocurrency wallet addresses (BTC, ETH, SOL, XMR, DASH)"
					enabled={activeConfig.cryptoAddressDetection.enabled}
					action={activeConfig.cryptoAddressDetection.action}
					onToggle={(value) => toggleRule("cryptoAddressDetection", value)}
					onActionChange={(action) => updateRuleValue("cryptoAddressDetection", { action })}
					visualization={<CryptoViz />}
					{...ruleConfigureProps("cryptoAddressDetection")}
				/>
				<RuleCardGrid
					title="Vouched users only"
					modalTitle="Vouched users only"
					description={
						activeConfig.vouchedUsersOnly.vouchScope === "global"
							? "Allow contributions only from globally vouched users"
							: activeConfig.vouchedUsersOnly.vouchScope === "both"
								? "Allow contributions from repo whitelist or globally vouched users"
								: "Allow contributions only from users on the whitelist (People tab)"
					}
					enabled={activeConfig.vouchedUsersOnly.enabled}
					action={activeConfig.vouchedUsersOnly.action}
					onToggle={(value) => toggleRule("vouchedUsersOnly", value)}
					onActionChange={(action) => updateRuleValue("vouchedUsersOnly", { action })}
					visualization={<VouchedUsersViz />}
					configureHint={() => (
						<div className="flex flex-col gap-2 w-full">
							<span className="text-[12px] font-medium text-tw-text-secondary">Vouch scope</span>
							<div className="flex items-center gap-1">
								{(["repo", "global", "both"] as const).map((s) => (
									<button
										key={s}
										type="button"
										onClick={() => updateRuleValue("vouchedUsersOnly", { vouchScope: s } as never)}
										className={`px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors cursor-pointer ${
											activeConfig.vouchedUsersOnly.vouchScope === s
												? "bg-tw-inner text-tw-text-primary"
												: "text-tw-text-tertiary hover:text-tw-text-secondary"
										}`}
									>
										{s === "repo" ? "Repo whitelist" : s === "global" ? "Global vouches" : "Both"}
									</button>
								))}
							</div>
							<p className="text-[11px] text-tw-text-tertiary leading-snug m-0">
								{activeConfig.vouchedUsersOnly.vouchScope === "repo"
									? "Only users on this repo's whitelist can contribute."
									: activeConfig.vouchedUsersOnly.vouchScope === "global"
										? "Any globally vouched user can contribute, regardless of repo whitelist."
										: "Users on the repo whitelist or the global vouch list can contribute."}
							</p>
						</div>
					)}
					{...ruleConfigureProps("vouchedUsersOnly")}
				/>
				<RuleCardGrid
					title="AI honeypot"
					modalTitle="AI honeypot"
					description="Flag PRs that mention the hidden phrase injected into your PR template (Files tab)"
					enabled={activeConfig.aiHoneypot.enabled}
					action={activeConfig.aiHoneypot.action}
					onToggle={(value) => toggleRule("aiHoneypot", value)}
					onActionChange={(action) => updateRuleValue("aiHoneypot", { action })}
					visualization={<AiSlopViz />}
					configureHint={({ close }) => (
						<>
							Honeypot phrases and the hidden line injected into your PR template live in the{" "}
							<button
								type="button"
								onClick={() => {
									setTab("files");
									close();
								}}
								className="text-tw-accent hover:underline underline-offset-2 cursor-pointer"
							>
								Files tab
							</button>
							. This dialog only changes how Tripwire reacts when the phrase is detected.
						</>
					)}
					{...ruleConfigureProps("aiHoneypot")}
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
								{activeConfig.aiSlopDetection.enabled && matchesSearch(allRules[0]) && (
									<RuleCardGrid title="AI slop detection" modalTitle="AI slop detection" description="Use known detection patterns to minimize automated activity" enabled={true} action={activeConfig.aiSlopDetection.action} onToggle={(v) => toggleRule("aiSlopDetection", v)} onActionChange={(a) => updateRuleValue("aiSlopDetection", { action: a })} visualization={<AiSlopViz />} comingSoon {...ruleConfigureProps("aiSlopDetection")} />
								)}
								{activeConfig.languageRequirement.enabled && matchesSearch(allRules[1]) && (
									<RuleCardGrid title={`Require contributions in ${activeConfig.languageRequirement.language}`} modalTitle="Language requirement" description="Contributions in a disallowed language will be declined" enabled={true} action={activeConfig.languageRequirement.action} onToggle={(v) => toggleRule("languageRequirement", v)} onActionChange={(a) => updateRuleValue("languageRequirement", { action: a })} visualization={<LanguageViz />} {...ruleConfigureProps("languageRequirement")} />
								)}
								{activeConfig.minMergedPrs.enabled && matchesSearch(allRules[2]) && (
									<RuleCardGrid title={`At least ${activeConfig.minMergedPrs.count} merged PRs`} modalTitle="Minimum merged PRs" description="Minimum merged pull requests before they can contribute" enabled={true} action={activeConfig.minMergedPrs.action} onToggle={(v) => toggleRule("minMergedPrs", v)} onActionChange={(a) => updateRuleValue("minMergedPrs", { action: a })} visualization={<MergedPrsViz />} numericConfig={{ value: activeConfig.minMergedPrs.count, label: "Minimum merged PRs", onChange: (count) => updateRuleValue("minMergedPrs", { count }) }} {...ruleConfigureProps("minMergedPrs")} />
								)}
								{activeConfig.accountAge.enabled && matchesSearch(allRules[3]) && (
									<RuleCardGrid title={`Account older than ${activeConfig.accountAge.days} days`} modalTitle="Account age requirement" description="Block accounts created too recently from contributing" enabled={true} action={activeConfig.accountAge.action} onToggle={(v) => toggleRule("accountAge", v)} onActionChange={(a) => updateRuleValue("accountAge", { action: a })} visualization={<AccountAgeViz />} numericConfig={{ value: activeConfig.accountAge.days, label: "Minimum account age (days)", onChange: (days) => updateRuleValue("accountAge", { days }) }} {...ruleConfigureProps("accountAge")} />
								)}
								{activeConfig.maxPrsPerDay.enabled && matchesSearch(allRules[4]) && (
									<RuleCardGrid title={`Max ${activeConfig.maxPrsPerDay.limit} PRs per day`} modalTitle="Max PRs per day" description="Rate limit how many PRs or issues a single user can open per day" enabled={true} action={activeConfig.maxPrsPerDay.action} onToggle={(v) => toggleRule("maxPrsPerDay", v)} onActionChange={(a) => updateRuleValue("maxPrsPerDay", { action: a })} visualization={<MaxPrsPerDayViz />} numericConfig={{ value: activeConfig.maxPrsPerDay.limit, label: "Maximum PRs per day", onChange: (limit) => updateRuleValue("maxPrsPerDay", { limit }) }} {...ruleConfigureProps("maxPrsPerDay")} />
								)}
								{activeConfig.maxFilesChanged.enabled && matchesSearch(allRules[5]) && (
									<RuleCardGrid title={`Max ${activeConfig.maxFilesChanged.limit} files changed`} modalTitle="Max files changed" description="Block pull requests that touch too many files in a single submission" enabled={true} action={activeConfig.maxFilesChanged.action} onToggle={(v) => toggleRule("maxFilesChanged", v)} onActionChange={(a) => updateRuleValue("maxFilesChanged", { action: a })} visualization={<MaxFilesChangedViz />} numericConfig={{ value: activeConfig.maxFilesChanged.limit, label: "Maximum files changed", onChange: (limit) => updateRuleValue("maxFilesChanged", { limit }) }} {...ruleConfigureProps("maxFilesChanged")} />
								)}
								{activeConfig.repoActivityMinimum.enabled && matchesSearch(allRules[6]) && (
									<RuleCardGrid title={`At least ${activeConfig.repoActivityMinimum.minRepos} public repos`} modalTitle="Repo activity minimum" description="Contributor must have meaningful activity across other public repos" enabled={true} action={activeConfig.repoActivityMinimum.action} onToggle={(v) => toggleRule("repoActivityMinimum", v)} onActionChange={(a) => updateRuleValue("repoActivityMinimum", { action: a })} visualization={<RepoActivityViz />} numericConfig={{ value: activeConfig.repoActivityMinimum.minRepos, label: "Minimum public repos", onChange: (minRepos) => updateRuleValue("repoActivityMinimum", { minRepos }) }} {...ruleConfigureProps("repoActivityMinimum")} />
								)}
								{activeConfig.requireProfileReadme.enabled && matchesSearch(allRules[7]) && (
									<RuleCardGrid title="Require profile README" modalTitle="Require profile README" description="Contributors must have a profile README on their GitHub account" enabled={true} action={activeConfig.requireProfileReadme.action} onToggle={(v) => toggleRule("requireProfileReadme", v)} onActionChange={(a) => updateRuleValue("requireProfileReadme", { action: a })} visualization={<ProfileReadmeViz />} {...ruleConfigureProps("requireProfileReadme")} />
								)}
								{activeConfig.cryptoAddressDetection.enabled && matchesSearch(allRules[8]) && (
									<RuleCardGrid title="Crypto address detection" modalTitle="Crypto address detection" description="Block content containing cryptocurrency wallet addresses (BTC, ETH, SOL, XMR, DASH)" enabled={true} action={activeConfig.cryptoAddressDetection.action} onToggle={(v) => toggleRule("cryptoAddressDetection", v)} onActionChange={(a) => updateRuleValue("cryptoAddressDetection", { action: a })} visualization={<CryptoViz />} {...ruleConfigureProps("cryptoAddressDetection")} />
								)}
								{activeConfig.vouchedUsersOnly.enabled && matchesSearch(allRules[9]) && (
									<RuleCardGrid title="Vouched users only" modalTitle="Vouched users only" description={activeConfig.vouchedUsersOnly.vouchScope === "global" ? "Global vouches only" : activeConfig.vouchedUsersOnly.vouchScope === "both" ? "Repo whitelist + global vouches" : "Repo whitelist only"} enabled={true} action={activeConfig.vouchedUsersOnly.action} onToggle={(v) => toggleRule("vouchedUsersOnly", v)} onActionChange={(a) => updateRuleValue("vouchedUsersOnly", { action: a })} visualization={<VouchedUsersViz />} {...ruleConfigureProps("vouchedUsersOnly")} />
								)}
								{activeConfig.aiHoneypot.enabled && matchesSearch(allRules[10]) && (
									<RuleCardGrid
										title="AI honeypot"
										modalTitle="AI honeypot"
										description="Flag PRs that mention the hidden phrase injected into your PR template (Files tab)"
										enabled={true}
										action={activeConfig.aiHoneypot.action}
										onToggle={(v) => toggleRule("aiHoneypot", v)}
										onActionChange={(a) => updateRuleValue("aiHoneypot", { action: a })}
										visualization={<AiSlopViz />}
										configureHint={({ close }) => (
											<>
												Honeypot phrases and the hidden line injected into your PR template live in the{" "}
												<button
													type="button"
													onClick={() => {
														setTab("files");
														close();
													}}
													className="text-tw-accent hover:underline underline-offset-2 cursor-pointer"
												>
													Files tab
												</button>
												. This dialog only changes how Tripwire reacts when the phrase is detected.
											</>
										)}
										{...ruleConfigureProps("aiHoneypot")}
									/>
								)}
							</div>
						)
					)}

					{/* People tab: always block + always allow */}
					{tab === "people" && (
						<PeopleTab
							suggestedContributors={suggestedQuery.data ?? undefined}
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
							onRemoveBlacklist={async (username) => {
								if (repoId) await removeBlacklist.mutateAsync({ repoId, githubUsername: username });
							}}
							onAddWhitelist={async (username) => {
								if (repoId) await addWhitelist.mutateAsync({ repoId, githubUsername: username });
							}}
							onRemoveWhitelist={async (username) => {
								if (repoId) await removeWhitelist.mutateAsync({ repoId, githubUsername: username });
							}}
							isAddingBlacklist={addBlacklist.isPending}
							isAddingWhitelist={addWhitelist.isPending}
							isAdmin={isAdmin}
						/>
					)}

					{tab === "requests" && (
						<RequestsTab
							repoRequests={requestsQuery.data ?? []}
							repoRequestsLoading={requestsQuery.isLoading}
							vouchRequests={vouchRequestsQuery.data ?? []}
							vouchRequestsLoading={vouchRequestsQuery.isLoading}
							onDecideRepoRequest={(id, decision) => decideRequest.mutate({ requestId: id, decision })}
							onDecideVouchRequest={(id, decision) => decideVouchRequest.mutate({ requestId: id, decision })}
							isDecidingRepo={decideRequest.isPending}
							isDecidingVouch={decideVouchRequest.isPending}
						/>
					)}

					{tab === "files" && (
						<RepoFilesTree
							config={activeConfig}
							repoFullName={repo?.fullName ?? "owner/repo"}
							isPending={updateConfig.isPending}
							generateRulesMd={generateRulesMd}
							generatePrTemplate={generatePrTemplate}
							generateAgentsMd={generateAgentsMd}
							onUpdateContent={updateRepoFileContent}
							onToggle={toggleRepoFile}
							onAddHoneypotPhrase={addHoneypotPhrase}
							onRemoveHoneypotPhrase={removeHoneypotPhrase}
						/>
					)}

					{tab === "workflows" && (
						<WorkflowsTab repoId={repoId} />
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
						<Button
							variant="ghost"
							size="sm"
							onClick={() => leaveBlocker.reset?.()}
							className="h-8 rounded-[10px] px-3 text-[12px] text-tw-text-tertiary hover:bg-tw-hover hover:text-tw-text-secondary"
						>
							Stay
						</Button>
						<Button
							variant="secondary"
							size="sm"
							onClick={() => leaveBlocker.proceed?.()}
							className="h-8 rounded-[10px] px-3 text-[12px] bg-white text-black hover:bg-white/90"
						>
							Leave
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
}


function RequestsTab({ repoRequests, repoRequestsLoading, vouchRequests, vouchRequestsLoading, onDecideRepoRequest, onDecideVouchRequest, isDecidingRepo, isDecidingVouch }: {
	repoRequests: Array<{ id: string; kind: string; githubUsername: string; avatarUrl: string | null; reason: string }>;
	repoRequestsLoading: boolean;
	vouchRequests: Array<{ id: string; githubUsername: string; avatarUrl: string | null; reason: string }>;
	vouchRequestsLoading: boolean;
	onDecideRepoRequest: (id: string, decision: "approve" | "deny") => void;
	onDecideVouchRequest: (id: string, decision: "approve" | "deny") => void;
	isDecidingRepo: boolean;
	isDecidingVouch: boolean;
}) {
	const [subtab, setSubtab] = useState<"appeals" | "access" | "vouches">("appeals");
	const appeals = repoRequests.filter((r) => r.kind === "unblock");
	const access = repoRequests.filter((r) => r.kind === "access");
	const isLoading = subtab === "vouches" ? vouchRequestsLoading : repoRequestsLoading;
	const items = subtab === "appeals" ? appeals : subtab === "access" ? access : vouchRequests;
	const emptyMsg = subtab === "appeals"
		? "No pending appeals. Blocked users can appeal via the link in their bot comment."
		: subtab === "access" ? "No pending access requests." : "No pending vouch requests. Users can apply from the vouched contributors page.";

	return (
		<div className="flex flex-col gap-4 min-w-0">
			<div className="flex items-center gap-1 bg-tw-card rounded-[10px] p-1 self-start">
				{([
					{ key: "appeals" as const, label: "Appeals", count: appeals.length },
					{ key: "access" as const, label: "Access", count: access.length },
					{ key: "vouches" as const, label: "Vouches", count: vouchRequests.length },
				]).map(({ key, label, count }) => (
					<button key={key} type="button" onClick={() => setSubtab(key)}
						className={`flex items-center gap-1.5 h-7 px-2.5 rounded-[6px] text-[12px] font-medium transition-colors cursor-pointer ${subtab === key ? "bg-[#FAFAFA1A] text-[#EEEEEE]" : "text-[#9F9FA9] hover:text-[#EEEEEE]"}`}>
						{label}
						{count > 0 && <span className="text-[11px] text-tw-accent tabular-nums ml-0.5">{count}</span>}
					</button>
				))}
			</div>
			{isLoading ? (
				<div className="rounded-xl bg-tw-card p-6 flex items-center justify-center">
					<div className="h-5 w-5 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
				</div>
			) : items.length === 0 ? (
				<div className="rounded-xl bg-tw-card p-6 text-center">
					<p className="text-[13px] text-[#FFFFFF73] m-0">{emptyMsg}</p>
				</div>
			) : (
				<div className="flex flex-col gap-2">
					{items.map((r) => {
						const isVouch = subtab === "vouches";
						const kind = "kind" in r ? r.kind : "vouch";
						const badge = isVouch ? "Vouch" : kind === "unblock" ? "Appeal" : "Access";
						const badgeClass = kind === "unblock" ? "bg-amber-500/15 text-amber-300" : "bg-tw-accent/15 text-tw-accent";
						const label = isVouch ? "Vouch" : kind === "unblock" ? "Unblock" : "Add to whitelist";
						return (
							<div key={r.id} className="rounded-xl bg-tw-card border border-tw-border-card p-4 flex flex-col gap-3">
								<div className="flex items-start gap-3">
									<img src={r.avatarUrl ?? `https://github.com/${r.githubUsername}.png`} alt="" className="w-8 h-8 rounded-full bg-white/5" />
									<div className="flex flex-col gap-0.5 flex-1 min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-[14px] font-medium text-white">@{r.githubUsername}</span>
											<span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeClass}`}>{badge}</span>
										</div>
										<p className="text-[13px] text-[#FFFFFFB3] m-0 whitespace-pre-wrap">{r.reason}</p>
									</div>
								</div>
								<div className="flex items-center gap-2 self-end">
									<Button size="xs" variant="ghost" disabled={isVouch ? isDecidingVouch : isDecidingRepo} onClick={() => isVouch ? onDecideVouchRequest(r.id, "deny") : onDecideRepoRequest(r.id, "deny")} className="text-[12px] text-tw-text-tertiary hover:text-red-400">Deny</Button>
									<Button size="xs" disabled={isVouch ? isDecidingVouch : isDecidingRepo} onClick={() => isVouch ? onDecideVouchRequest(r.id, "approve") : onDecideRepoRequest(r.id, "approve")} className="text-[12px]">{label}</Button>
								</div>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}

function WorkflowsTab({ repoId }: { repoId: string | undefined }) {
	const trpc = useTRPC();
	const navigate = useNavigate();
	const { org } = useWorkspace();

	const workflowsQuery = useQuery(
		trpc.workflows.list.queryOptions(
			{ repoId: repoId ?? "" },
			{ enabled: !!repoId },
		),
	);
	const wfList = workflowsQuery.data ?? [];

	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<p className="text-[13px] text-tw-text-secondary">
					Automation workflows for this repo.
				</p>
				<button
					type="button"
					onClick={() => navigate({ to: `/${org?.slug}/automations` })}
					className="text-[12px] text-tw-accent hover:underline"
				>
					Open editor
				</button>
			</div>

			{workflowsQuery.isPending ? (
				<div className="py-8 text-center text-tw-text-muted text-[13px]">Loading...</div>
			) : wfList.length === 0 ? (
				<div className="py-8 text-center">
					<p className="text-[13px] text-tw-text-muted mb-2">No workflows yet.</p>
					<button
						type="button"
						onClick={() => navigate({ to: `/${org?.slug}/automations` })}
						className="text-[12px] text-tw-accent hover:underline"
					>
						Create your first workflow
					</button>
				</div>
			) : (
				<div className="flex flex-col gap-1.5">
					{wfList.map((wf) => {
						const nodeCount = (wf.definition as { nodes: unknown[] }).nodes?.length ?? 0;
						return (
							<button
								key={wf.id}
								type="button"
								onClick={() => navigate({ to: `/${org?.slug}/automations/${wf.id}` })}
								className="flex items-center gap-3 p-3 rounded-xl bg-tw-card border border-tw-border-card hover:border-[#FFFFFF1A] transition-colors text-left"
							>
								<div className="flex flex-col min-w-0 flex-1">
									<span className="text-[13px] font-medium text-tw-text-primary truncate">{wf.name}</span>
									<span className="text-[11px] text-tw-text-muted">
										{nodeCount} node{nodeCount !== 1 ? "s" : ""} · Updated {new Date(wf.updatedAt).toLocaleDateString()}
									</span>
								</div>
								<span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${wf.enabled ? "bg-tw-success/10 text-tw-success" : "bg-tw-inner text-tw-text-muted"}`}>
									{wf.enabled ? "Active" : "Draft"}
								</span>
							</button>
						);
					})}
				</div>
			)}
		</div>
	);
}
