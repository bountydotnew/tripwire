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

export function RulesInstalledPanel() {
  const {
    activeConfig,
    toggleRule,
    updateRuleValue,
    ruleConfigureProps,
    searchQuery,
    allRules,
    matchesSearch,
    installedRuleKeys,
    navigateToRulesTab,
  } = useRulesWorkspace()

  return installedRuleKeys.filter(matchesSearch).length === 0 ? (
    <div className="rounded-xl bg-tw-card p-6 text-center">
      <p className="text-[13px] text-[#FFFFFF73]">
        {searchQuery
          ? "No installed rules match your search."
          : "No rules installed yet. Browse the marketplace to get started."}
      </p>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
      {activeConfig.languageRequirement.enabled &&
        matchesSearch(allRules[0]) && (
          <RuleCardGrid
            title={`Require contributions in ${activeConfig.languageRequirement.language}`}
            modalTitle="Language requirement"
            description="Contributions in a disallowed language will be declined"
            enabled={true}
            action={activeConfig.languageRequirement.action}
            onToggle={(v) => toggleRule("languageRequirement", v)}
            onActionChange={(a) =>
              updateRuleValue("languageRequirement", { action: a })
            }
            visualization={<LanguageViz />}
            {...ruleConfigureProps("languageRequirement")}
          />
        )}
      {activeConfig.minMergedPrs.enabled && matchesSearch(allRules[1]) && (
        <RuleCardGrid
          title={`At least ${activeConfig.minMergedPrs.count} merged PRs`}
          modalTitle="Minimum merged PRs"
          description="Minimum merged pull requests before they can contribute"
          enabled={true}
          action={activeConfig.minMergedPrs.action}
          onToggle={(v) => toggleRule("minMergedPrs", v)}
          onActionChange={(a) => updateRuleValue("minMergedPrs", { action: a })}
          visualization={<MergedPrsViz />}
          numericConfig={{
            value: activeConfig.minMergedPrs.count,
            label: "Minimum merged PRs",
            onChange: (count) => updateRuleValue("minMergedPrs", { count }),
          }}
          {...ruleConfigureProps("minMergedPrs")}
        />
      )}
      {activeConfig.accountAge.enabled && matchesSearch(allRules[2]) && (
        <RuleCardGrid
          title={`Account older than ${activeConfig.accountAge.days} days`}
          modalTitle="Account age requirement"
          description="Block accounts created too recently from contributing"
          enabled={true}
          action={activeConfig.accountAge.action}
          onToggle={(v) => toggleRule("accountAge", v)}
          onActionChange={(a) => updateRuleValue("accountAge", { action: a })}
          visualization={<AccountAgeViz />}
          numericConfig={{
            value: activeConfig.accountAge.days,
            label: "Minimum account age (days)",
            onChange: (days) => updateRuleValue("accountAge", { days }),
          }}
          {...ruleConfigureProps("accountAge")}
        />
      )}
      {activeConfig.maxPrsPerDay.enabled && matchesSearch(allRules[3]) && (
        <RuleCardGrid
          title={`Max ${activeConfig.maxPrsPerDay.limit} PRs per day`}
          modalTitle="Max PRs per day"
          description="Rate limit how many PRs or issues a single user can open per day"
          enabled={true}
          action={activeConfig.maxPrsPerDay.action}
          onToggle={(v) => toggleRule("maxPrsPerDay", v)}
          onActionChange={(a) => updateRuleValue("maxPrsPerDay", { action: a })}
          visualization={<MaxPrsPerDayViz />}
          numericConfig={{
            value: activeConfig.maxPrsPerDay.limit,
            label: "Maximum PRs per day",
            onChange: (limit) => updateRuleValue("maxPrsPerDay", { limit }),
          }}
          {...ruleConfigureProps("maxPrsPerDay")}
        />
      )}
      {activeConfig.maxFilesChanged.enabled && matchesSearch(allRules[4]) && (
        <RuleCardGrid
          title={`Max ${activeConfig.maxFilesChanged.limit} files changed`}
          modalTitle="Max files changed"
          description="Block pull requests that touch too many files in a single submission"
          enabled={true}
          action={activeConfig.maxFilesChanged.action}
          onToggle={(v) => toggleRule("maxFilesChanged", v)}
          onActionChange={(a) =>
            updateRuleValue("maxFilesChanged", { action: a })
          }
          visualization={<MaxFilesChangedViz />}
          numericConfig={{
            value: activeConfig.maxFilesChanged.limit,
            label: "Maximum files changed",
            onChange: (limit) => updateRuleValue("maxFilesChanged", { limit }),
          }}
          {...ruleConfigureProps("maxFilesChanged")}
        />
      )}
      {activeConfig.repoActivityMinimum.enabled &&
        matchesSearch(allRules[5]) && (
          <RuleCardGrid
            title={`At least ${activeConfig.repoActivityMinimum.minRepos} public repos`}
            modalTitle="Repo activity minimum"
            description="Contributor must have meaningful activity across other public repos"
            enabled={true}
            action={activeConfig.repoActivityMinimum.action}
            onToggle={(v) => toggleRule("repoActivityMinimum", v)}
            onActionChange={(a) =>
              updateRuleValue("repoActivityMinimum", { action: a })
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
        )}
      {activeConfig.requireProfileReadme.enabled &&
        matchesSearch(allRules[6]) && (
          <RuleCardGrid
            title="Require profile README"
            modalTitle="Require profile README"
            description="Contributors must have a profile README on their GitHub account"
            enabled={true}
            action={activeConfig.requireProfileReadme.action}
            onToggle={(v) => toggleRule("requireProfileReadme", v)}
            onActionChange={(a) =>
              updateRuleValue("requireProfileReadme", { action: a })
            }
            visualization={<ProfileReadmeViz />}
            {...ruleConfigureProps("requireProfileReadme")}
          />
        )}
      {activeConfig.cryptoAddressDetection.enabled &&
        matchesSearch(allRules[7]) && (
          <RuleCardGrid
            title="Crypto address detection"
            modalTitle="Crypto address detection"
            description="Block content containing cryptocurrency wallet addresses (BTC, ETH, SOL, XMR, DASH)"
            enabled={true}
            action={activeConfig.cryptoAddressDetection.action}
            onToggle={(v) => toggleRule("cryptoAddressDetection", v)}
            onActionChange={(a) =>
              updateRuleValue("cryptoAddressDetection", { action: a })
            }
            visualization={<CryptoViz />}
            {...ruleConfigureProps("cryptoAddressDetection")}
          />
        )}
      {activeConfig.vouchedUsersOnly.enabled && matchesSearch(allRules[8]) && (
        <RuleCardGrid
          title="Vouched users only"
          modalTitle="Vouched users only"
          description={
            activeConfig.vouchedUsersOnly.vouchScope === "global"
              ? "Global vouches only"
              : activeConfig.vouchedUsersOnly.vouchScope === "both"
                ? "Repo whitelist + global vouches"
                : "Repo whitelist only"
          }
          enabled={true}
          action={activeConfig.vouchedUsersOnly.action}
          onToggle={(v) => toggleRule("vouchedUsersOnly", v)}
          onActionChange={(a) =>
            updateRuleValue("vouchedUsersOnly", { action: a })
          }
          visualization={<VouchedUsersViz />}
          {...ruleConfigureProps("vouchedUsersOnly")}
        />
      )}
      {activeConfig.aiHoneypot.enabled && matchesSearch(allRules[9]) && (
        <RuleCardGrid
          title="AI honeypot"
          modalTitle="AI honeypot"
          description="Flag PRs that mention the hidden phrase injected into your PR template (Files tab)"
          enabled={true}
          action={activeConfig.aiHoneypot.action}
          onToggle={(v) => toggleRule("aiHoneypot", v)}
          onActionChange={(a) => updateRuleValue("aiHoneypot", { action: a })}
          visualization={<CryptoViz />}
          configureHint={({ close }) => (
            <>
              Honeypot phrases and the hidden line injected into your PR
              template live in the{" "}
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
      )}
    </div>
  )
}
