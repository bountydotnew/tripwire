import {
  AccountAgeViz,
  CryptoViz,
  LanguageViz,
  MaxFilesChangedViz,
  MaxPrsPerDayViz,
  MergedPrsViz,
  ProfileReadmeViz,
  RepoActivityViz,
  RuleCardGrid,
  VouchedUsersViz,
} from "#/components/rules/rule-card-grid"
import { useRulesWorkspace } from "#/components/rules/rules-workspace-context"
import { Button } from "#/components/ui/button"

export function RulesMarketplacePanel() {
  const {
    activeConfig,
    toggleRule,
    updateRuleValue,
    ruleConfigureProps,
    navigateToRulesTab,
  } = useRulesWorkspace()

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      <RuleCardGrid
        title={`Require contributions in ${activeConfig.languageRequirement.language}`}
        modalTitle="Language requirement"
        description="Contributions in a disallowed language will be declined"
        enabled={activeConfig.languageRequirement.enabled}
        action={activeConfig.languageRequirement.action}
        onToggle={(value) => toggleRule("languageRequirement", value)}
        onActionChange={(action) =>
          updateRuleValue("languageRequirement", { action })
        }
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
        onActionChange={(action) =>
          updateRuleValue("maxFilesChanged", { action })
        }
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
        onActionChange={(action) =>
          updateRuleValue("repoActivityMinimum", { action })
        }
        visualization={<RepoActivityViz />}
        numericConfig={{
          value: activeConfig.repoActivityMinimum.minRepos,
          label: "Minimum public repos",
          onChange: (minRepos) =>
            updateRuleValue("repoActivityMinimum", { minRepos }),
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
        onActionChange={(action) =>
          updateRuleValue("requireProfileReadme", { action })
        }
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
        onActionChange={(action) =>
          updateRuleValue("cryptoAddressDetection", { action })
        }
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
        onActionChange={(action) =>
          updateRuleValue("vouchedUsersOnly", { action })
        }
        visualization={<VouchedUsersViz />}
        configureHint={() => (
          <div className="flex w-full flex-col gap-2">
            <span className="text-[12px] font-medium text-tw-text-secondary">
              Vouch scope
            </span>
            <div className="flex items-center gap-1">
              {(["repo", "global", "both"] as const).map((s) => (
                <Button
                  variant="ghost"
                  key={s}
                  type="button"
                  onClick={() =>
                    updateRuleValue("vouchedUsersOnly", {
                      vouchScope: s,
                    } as never)
                  }
                  className={`cursor-pointer rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                    activeConfig.vouchedUsersOnly.vouchScope === s
                      ? "bg-tw-inner text-tw-text-primary"
                      : "text-tw-text-tertiary hover:text-tw-text-secondary"
                  }`}
                >
                  {s === "repo"
                    ? "Repo whitelist"
                    : s === "global"
                      ? "Global vouches"
                      : "Both"}
                </Button>
              ))}
            </div>
            <p className="m-0 text-[11px] leading-snug text-tw-text-tertiary">
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
        visualization={<CryptoViz />}
        configureHint={({ close }) => (
          <>
            Honeypot phrases and the hidden line injected into your PR template
            live in the{" "}
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                navigateToRulesTab("files")
                close()
              }}
              className="cursor-pointer text-tw-accent underline-offset-2 hover:underline"
            >
              Files tab
            </Button>
            . This dialog only changes how Tripwire reacts when the phrase is
            detected.
          </>
        )}
        {...ruleConfigureProps("aiHoneypot")}
      />
    </div>
  )
}
