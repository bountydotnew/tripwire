// Human-friendly labels for rule names shown in PR comments and UI.
// Add a new entry whenever a new rule type ships.
export const RULE_LABELS: Record<string, string> = {
  accountAge: "Account Age",
  minMergedPrs: "Merged PR Count",
  maxPrsPerDay: "PR Rate Limit",
  maxFilesChanged: "Files Changed Limit",
  repoActivityMinimum: "Public Repo Minimum",
  requireProfileReadme: "Profile README Required",
  languageRequirement: "Language Requirement",
  cryptoAddressDetection: "Crypto Address Detected",
  vouchedUsersOnly: "Vouched Users Only",
  aiHoneypot: "AI Honeypot",
  blacklist: "Blacklisted",
}

/** Returns the friendly label, or the raw rule name as a fallback. */
export function ruleLabel(name: string): string {
  // Custom rules use a "custom:<name>" prefix; strip it for display.
  if (name.startsWith("custom:")) return name.slice("custom:".length)
  return RULE_LABELS[name] ?? name
}
