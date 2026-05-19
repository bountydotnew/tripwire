import {
  DEFAULT_RULE_CONFIG,
  RULE_KEYS,
  RULE_META,
  type ContentScope,
  type RuleAction,
  type RuleConfig,
  type RuleKey,
} from "@tripwire/db"

export type RuleConfigChangeTone =
  | "neutral"
  | "muted"
  | "accent"
  | "success"
  | "warning"
  | "danger"

export interface RuleConfigChange {
  id: string
  ruleKey: keyof RuleConfig
  field: string
  label: string
  title: string
  before?: string
  after?: string
  beforeTone?: RuleConfigChangeTone
  afterTone?: RuleConfigChangeTone
}

type RuleField = keyof RuleConfig[RuleKey]

const RULE_ORDER: readonly RuleKey[] = RULE_KEYS

const SCOPE_LABELS: Record<keyof ContentScope, string> = {
  pullRequests: "Pull requests",
  issues: "Issues",
  comments: "Comments",
}

const SCOPE_FIELD_ORDER: (keyof ContentScope)[] = [
  "pullRequests",
  "issues",
  "comments",
]

const RULE_LABELS: Record<RuleKey, string> = Object.fromEntries(
  Object.entries(RULE_META).map(([k, v]) => [k, v.name])
) as Record<RuleKey, string>

const ACTION_LABELS: Record<RuleAction, string> = {
  block: "Block",
  warn: "Warn",
  log: "Log",
  threshold: "Threshold",
}

const FIELD_ORDER: Record<RuleKey, string[]> = {
  languageRequirement: ["enabled", "action", "language", "thresholdCount"],
  minMergedPrs: ["enabled", "action", "count", "thresholdCount"],
  accountAge: ["enabled", "action", "days", "thresholdCount"],
  maxPrsPerDay: ["enabled", "action", "limit", "thresholdCount"],
  maxFilesChanged: ["enabled", "action", "limit", "thresholdCount"],
  repoActivityMinimum: ["enabled", "action", "minRepos", "thresholdCount"],
  requireProfileReadme: ["enabled", "action", "thresholdCount"],
  cryptoAddressDetection: ["enabled", "action", "thresholdCount"],
  vouchedUsersOnly: ["enabled", "action", "thresholdCount"],
  aiHoneypot: ["enabled", "action", "thresholdCount"],
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean")
    return String(value)
  if (value === undefined || value === null) return "none"
  return JSON.stringify(value)
}

function formatAction(value: unknown): string {
  return ACTION_LABELS[value as RuleAction] ?? formatScalar(value)
}

function actionTone(value: unknown): RuleConfigChangeTone {
  switch (value as RuleAction) {
    case "block":
      return "danger"
    case "warn":
      return "warning"
    case "threshold":
      return "accent"
    case "log":
    default:
      return "muted"
  }
}

function stateTone(value: unknown): RuleConfigChangeTone {
  return value ? "success" : "muted"
}

function getOrderedFields(
  ruleKey: RuleKey,
  baseRule: RuleConfig[RuleKey],
  draftRule: RuleConfig[RuleKey]
): string[] {
  const knownFields = FIELD_ORDER[ruleKey]
  const extraFields = Array.from(
    new Set(
      [...Object.keys(baseRule), ...Object.keys(draftRule)].filter(
        (field) => !knownFields.includes(field)
      )
    )
  ).sort()
  return [...knownFields, ...extraFields]
}

function buildChange(
  ruleKey: RuleKey,
  field: string,
  previousValue: unknown,
  nextValue: unknown
): RuleConfigChange {
  const ruleLabel = RULE_LABELS[ruleKey]
  const id = `${ruleKey}.${field}`

  if (field === "enabled") {
    const before = previousValue ? "Enabled" : "Disabled"
    const after = nextValue ? "Enabled" : "Disabled"
    return {
      id,
      ruleKey,
      field,
      title: ruleLabel,
      before,
      after,
      beforeTone: stateTone(previousValue),
      afterTone: stateTone(nextValue),
      label: `${ruleLabel} changed to ${before} -> ${after}`,
    }
  }

  if (field === "action") {
    const before = formatAction(previousValue)
    const after = formatAction(nextValue)
    return {
      id,
      ruleKey,
      field,
      title: `${ruleLabel} action`,
      before,
      after,
      beforeTone: actionTone(previousValue),
      afterTone: actionTone(nextValue),
      label: `${ruleLabel} action changed to ${before} -> ${after}`,
    }
  }

  if (field === "language") {
    const after = formatScalar(nextValue)
    return {
      id,
      ruleKey,
      field,
      title: ruleLabel,
      before:
        previousValue !== undefined ? formatScalar(previousValue) : undefined,
      after,
      beforeTone: "muted",
      afterTone: "accent",
      label: `${ruleLabel} changed to ${previousValue !== undefined ? `${formatScalar(previousValue)} -> ` : ""}${after}`,
    }
  }

  if (nextValue === undefined) {
    return {
      id,
      ruleKey,
      field,
      title: `${ruleLabel} ${field}`,
      before: formatScalar(previousValue),
      after: "Cleared",
      beforeTone: "neutral",
      afterTone: "muted",
      label: `${ruleLabel} ${field} changed to ${formatScalar(previousValue)} -> Cleared`,
    }
  }

  if (previousValue === undefined) {
    return {
      id,
      ruleKey,
      field,
      title: `${ruleLabel} ${field}`,
      before: "Unset",
      after: formatScalar(nextValue),
      beforeTone: "muted",
      afterTone: "accent",
      label: `${ruleLabel} ${field} changed to Unset -> ${formatScalar(nextValue)}`,
    }
  }

  return {
    id,
    ruleKey,
    field,
    title: `${ruleLabel} ${field}`,
    before: formatScalar(previousValue),
    after: formatScalar(nextValue),
    beforeTone: "neutral",
    afterTone: "accent",
    label: `${ruleLabel} ${field} changed to ${formatScalar(previousValue)} -> ${formatScalar(nextValue)}`,
  }
}

export function normalizeRuleConfig(raw?: Partial<RuleConfig>): RuleConfig {
  return {
    languageRequirement: {
      ...DEFAULT_RULE_CONFIG.languageRequirement,
      ...raw?.languageRequirement,
    },
    minMergedPrs: { ...DEFAULT_RULE_CONFIG.minMergedPrs, ...raw?.minMergedPrs },
    accountAge: { ...DEFAULT_RULE_CONFIG.accountAge, ...raw?.accountAge },
    maxPrsPerDay: { ...DEFAULT_RULE_CONFIG.maxPrsPerDay, ...raw?.maxPrsPerDay },
    maxFilesChanged: {
      ...DEFAULT_RULE_CONFIG.maxFilesChanged,
      ...raw?.maxFilesChanged,
    },
    repoActivityMinimum: {
      ...DEFAULT_RULE_CONFIG.repoActivityMinimum,
      ...raw?.repoActivityMinimum,
    },
    requireProfileReadme: {
      ...DEFAULT_RULE_CONFIG.requireProfileReadme,
      ...raw?.requireProfileReadme,
    },
    cryptoAddressDetection: {
      ...DEFAULT_RULE_CONFIG.cryptoAddressDetection,
      ...raw?.cryptoAddressDetection,
    },
    vouchedUsersOnly: {
      ...DEFAULT_RULE_CONFIG.vouchedUsersOnly,
      ...raw?.vouchedUsersOnly,
    },
    aiHoneypot: { ...DEFAULT_RULE_CONFIG.aiHoneypot, ...raw?.aiHoneypot },
    autoWhitelistGlobalVouches: {
      ...DEFAULT_RULE_CONFIG.autoWhitelistGlobalVouches,
      ...raw?.autoWhitelistGlobalVouches,
    },
    contentScope: { ...DEFAULT_RULE_CONFIG.contentScope, ...raw?.contentScope },
    repoFiles: {
      rulesMd: {
        ...DEFAULT_RULE_CONFIG.repoFiles.rulesMd,
        ...raw?.repoFiles?.rulesMd,
        customContent:
          typeof raw?.repoFiles?.rulesMd?.customContent === "string"
            ? raw.repoFiles.rulesMd.customContent
            : "",
      },
      prTemplate: normalizePrTemplate(raw?.repoFiles?.prTemplate),
      agentsMd: normalizeAgentsMd(raw?.repoFiles?.agentsMd),
    },
  }
}

function normalizePrTemplate(
  raw: Partial<RuleConfig["repoFiles"]["prTemplate"]> | undefined
): RuleConfig["repoFiles"]["prTemplate"] {
  const base = DEFAULT_RULE_CONFIG.repoFiles.prTemplate
  const phrases: RuleConfig["repoFiles"]["prTemplate"]["honeypotPhrases"] =
    Array.isArray(raw?.honeypotPhrases)
      ? raw.honeypotPhrases.filter(
          (p) => p && typeof p.phrase === "string" && p.phrase.length > 0
        )
      : typeof (raw as { honeypotPhrase?: unknown })?.honeypotPhrase ===
            "string" &&
          (raw as { honeypotPhrase: string }).honeypotPhrase.length > 0
        ? [
            {
              kind: "codeword" as const,
              phrase: (raw as { honeypotPhrase: string }).honeypotPhrase,
            },
          ]
        : []

  return {
    autoSync: raw?.autoSync ?? base.autoSync,
    honeypotEnabled: raw?.honeypotEnabled ?? base.honeypotEnabled,
    honeypotPhrases: phrases,
    customContent:
      typeof raw?.customContent === "string" ? raw.customContent : "",
  }
}

function normalizeAgentsMd(
  raw: Partial<RuleConfig["repoFiles"]["agentsMd"]> | undefined
): RuleConfig["repoFiles"]["agentsMd"] {
  const base = DEFAULT_RULE_CONFIG.repoFiles.agentsMd
  const phrases: RuleConfig["repoFiles"]["agentsMd"]["honeypotPhrases"] =
    Array.isArray(raw?.honeypotPhrases)
      ? raw.honeypotPhrases.filter(
          (p) => p && typeof p.phrase === "string" && p.phrase.length > 0
        )
      : []

  return {
    autoSync: raw?.autoSync ?? base.autoSync,
    honeypotEnabled: raw?.honeypotEnabled ?? base.honeypotEnabled,
    honeypotPhrases: phrases,
    customContent:
      typeof raw?.customContent === "string" ? raw.customContent : "",
  }
}

export function getRuleConfigChanges(
  base: RuleConfig,
  draft: RuleConfig
): RuleConfigChange[] {
  const normalizedBase = normalizeRuleConfig(base)
  const normalizedDraft = normalizeRuleConfig(draft)
  const changes: RuleConfigChange[] = []

  for (const ruleKey of RULE_ORDER) {
    const baseRule = normalizedBase[ruleKey]
    const draftRule = normalizedDraft[ruleKey]

    for (const field of getOrderedFields(ruleKey, baseRule, draftRule)) {
      if (
        Object.is(baseRule[field as RuleField], draftRule[field as RuleField])
      ) {
        continue
      }

      changes.push(
        buildChange(
          ruleKey,
          field,
          baseRule[field as RuleField],
          draftRule[field as RuleField]
        )
      )
    }
  }

  for (const field of SCOPE_FIELD_ORDER) {
    const before = normalizedBase.contentScope[field]
    const after = normalizedDraft.contentScope[field]
    if (before === after) continue
    const label = SCOPE_LABELS[field]
    changes.push({
      id: `contentScope.${field}`,
      ruleKey: "contentScope",
      field,
      title: `Watch ${label.toLowerCase()}`,
      before: before ? "On" : "Off",
      after: after ? "On" : "Off",
      beforeTone: before ? "success" : "muted",
      afterTone: after ? "success" : "muted",
      label: `Watch ${label.toLowerCase()}: ${before ? "On" : "Off"} -> ${after ? "On" : "Off"}`,
    })
  }

  // repoFiles boolean toggles
  const repoFileToggles: {
    id: string
    title: string
    before: boolean
    after: boolean
  }[] = [
    {
      id: "repoFiles.rulesMd.autoSync",
      title: "Auto-sync RULES.md",
      before: normalizedBase.repoFiles.rulesMd.autoSync,
      after: normalizedDraft.repoFiles.rulesMd.autoSync,
    },
    {
      id: "repoFiles.prTemplate.autoSync",
      title: "Auto-sync PR template",
      before: normalizedBase.repoFiles.prTemplate.autoSync,
      after: normalizedDraft.repoFiles.prTemplate.autoSync,
    },
    {
      id: "repoFiles.prTemplate.honeypotEnabled",
      title: "AI honeypot embed",
      before: normalizedBase.repoFiles.prTemplate.honeypotEnabled,
      after: normalizedDraft.repoFiles.prTemplate.honeypotEnabled,
    },
    {
      id: "repoFiles.agentsMd.autoSync",
      title: "Auto-sync AGENTS.md",
      before: normalizedBase.repoFiles.agentsMd.autoSync,
      after: normalizedDraft.repoFiles.agentsMd.autoSync,
    },
    {
      id: "repoFiles.agentsMd.honeypotEnabled",
      title: "AGENTS.md honeypot embed",
      before: normalizedBase.repoFiles.agentsMd.honeypotEnabled,
      after: normalizedDraft.repoFiles.agentsMd.honeypotEnabled,
    },
  ]
  for (const t of repoFileToggles) {
    if (t.before === t.after) continue
    changes.push({
      id: t.id,
      ruleKey: "repoFiles",
      field: t.id,
      title: t.title,
      before: t.before ? "On" : "Off",
      after: t.after ? "On" : "Off",
      beforeTone: t.before ? "success" : "muted",
      afterTone: t.after ? "success" : "muted",
      label: `${t.title}: ${t.before ? "On" : "Off"} -> ${t.after ? "On" : "Off"}`,
    })
  }

  const beforePhrases = normalizedBase.repoFiles.prTemplate.honeypotPhrases
  const afterPhrases = normalizedDraft.repoFiles.prTemplate.honeypotPhrases
  if (!honeypotPhrasesEqual(beforePhrases, afterPhrases)) {
    changes.push({
      id: "repoFiles.prTemplate.honeypotPhrases",
      ruleKey: "repoFiles",
      field: "honeypotPhrases",
      title: "AI honeypot phrases",
      before: `${beforePhrases.length}`,
      after: `${afterPhrases.length}`,
      beforeTone: "muted",
      afterTone:
        afterPhrases.length > beforePhrases.length ? "accent" : "muted",
      label: `AI honeypot phrases: ${beforePhrases.length} -> ${afterPhrases.length}`,
    })
  }

  const beforeAgentPhrases = normalizedBase.repoFiles.agentsMd.honeypotPhrases
  const afterAgentPhrases = normalizedDraft.repoFiles.agentsMd.honeypotPhrases
  if (!honeypotPhrasesEqual(beforeAgentPhrases, afterAgentPhrases)) {
    changes.push({
      id: "repoFiles.agentsMd.honeypotPhrases",
      ruleKey: "repoFiles",
      field: "honeypotPhrases",
      title: "AGENTS.md honeypot phrases",
      before: `${beforeAgentPhrases.length}`,
      after: `${afterAgentPhrases.length}`,
      beforeTone: "muted",
      afterTone:
        afterAgentPhrases.length > beforeAgentPhrases.length
          ? "accent"
          : "muted",
      label: `AGENTS.md honeypot phrases: ${beforeAgentPhrases.length} -> ${afterAgentPhrases.length}`,
    })
  }

  if (
    normalizedBase.repoFiles.rulesMd.customContent !==
    normalizedDraft.repoFiles.rulesMd.customContent
  ) {
    changes.push({
      id: "repoFiles.rulesMd.customContent",
      ruleKey: "repoFiles",
      field: "customContent",
      title: "RULES.md content",
      before: "previous",
      after: "edited",
      beforeTone: "muted",
      afterTone: "accent",
      label: "RULES.md content edited",
    })
  }

  if (
    normalizedBase.repoFiles.prTemplate.customContent !==
    normalizedDraft.repoFiles.prTemplate.customContent
  ) {
    changes.push({
      id: "repoFiles.prTemplate.customContent",
      ruleKey: "repoFiles",
      field: "customContent",
      title: "PR template content",
      before: "previous",
      after: "edited",
      beforeTone: "muted",
      afterTone: "accent",
      label: "PR template content edited",
    })
  }

  if (
    normalizedBase.repoFiles.agentsMd.customContent !==
    normalizedDraft.repoFiles.agentsMd.customContent
  ) {
    changes.push({
      id: "repoFiles.agentsMd.customContent",
      ruleKey: "repoFiles",
      field: "customContent",
      title: "AGENTS.md content",
      before: "previous",
      after: "edited",
      beforeTone: "muted",
      afterTone: "accent",
      label: "AGENTS.md content edited",
    })
  }

  return changes
}

function honeypotPhrasesEqual(
  a: RuleConfig["repoFiles"]["prTemplate"]["honeypotPhrases"],
  b: RuleConfig["repoFiles"]["prTemplate"]["honeypotPhrases"]
): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i].kind !== b[i].kind || a[i].phrase !== b[i].phrase) return false
  }
  return true
}

export function areRuleConfigsEqual(a: RuleConfig, b: RuleConfig): boolean {
  return getRuleConfigChanges(a, b).length === 0
}

export function revertRuleConfigChange(
  base: RuleConfig,
  draft: RuleConfig,
  changeId: string
): RuleConfig {
  const [headRaw, field] = changeId.split(".", 2) as [
    string | undefined,
    string | undefined,
  ]

  if (!headRaw || !field) return normalizeRuleConfig(draft)

  const normalizedBase = normalizeRuleConfig(base)
  const normalizedDraft = normalizeRuleConfig(draft)

  if (
    headRaw === "contentScope" &&
    (field === "pullRequests" || field === "issues" || field === "comments")
  ) {
    const nextDraft: RuleConfig = {
      ...normalizedDraft,
      contentScope: {
        ...normalizedDraft.contentScope,
        [field]: normalizedBase.contentScope[field],
      },
    }
    return normalizeRuleConfig(nextDraft)
  }

  if (headRaw === "repoFiles") {
    if (changeId === "repoFiles.rulesMd.autoSync") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          rulesMd: {
            ...normalizedDraft.repoFiles.rulesMd,
            autoSync: normalizedBase.repoFiles.rulesMd.autoSync,
          },
        },
      })
    }
    if (changeId === "repoFiles.prTemplate.autoSync") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          prTemplate: {
            ...normalizedDraft.repoFiles.prTemplate,
            autoSync: normalizedBase.repoFiles.prTemplate.autoSync,
          },
        },
      })
    }
    if (changeId === "repoFiles.prTemplate.honeypotEnabled") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          prTemplate: {
            ...normalizedDraft.repoFiles.prTemplate,
            honeypotEnabled:
              normalizedBase.repoFiles.prTemplate.honeypotEnabled,
          },
        },
      })
    }
    if (changeId === "repoFiles.prTemplate.honeypotPhrases") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          prTemplate: {
            ...normalizedDraft.repoFiles.prTemplate,
            honeypotPhrases:
              normalizedBase.repoFiles.prTemplate.honeypotPhrases.map((p) => ({
                ...p,
              })),
          },
        },
      })
    }
    if (changeId === "repoFiles.rulesMd.customContent") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          rulesMd: {
            ...normalizedDraft.repoFiles.rulesMd,
            customContent: normalizedBase.repoFiles.rulesMd.customContent,
          },
        },
      })
    }
    if (changeId === "repoFiles.prTemplate.customContent") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          prTemplate: {
            ...normalizedDraft.repoFiles.prTemplate,
            customContent: normalizedBase.repoFiles.prTemplate.customContent,
          },
        },
      })
    }
    if (changeId === "repoFiles.agentsMd.autoSync") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          agentsMd: {
            ...normalizedDraft.repoFiles.agentsMd,
            autoSync: normalizedBase.repoFiles.agentsMd.autoSync,
          },
        },
      })
    }
    if (changeId === "repoFiles.agentsMd.honeypotEnabled") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          agentsMd: {
            ...normalizedDraft.repoFiles.agentsMd,
            honeypotEnabled: normalizedBase.repoFiles.agentsMd.honeypotEnabled,
          },
        },
      })
    }
    if (changeId === "repoFiles.agentsMd.honeypotPhrases") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          agentsMd: {
            ...normalizedDraft.repoFiles.agentsMd,
            honeypotPhrases:
              normalizedBase.repoFiles.agentsMd.honeypotPhrases.map((p) => ({
                ...p,
              })),
          },
        },
      })
    }
    if (changeId === "repoFiles.agentsMd.customContent") {
      return normalizeRuleConfig({
        ...normalizedDraft,
        repoFiles: {
          ...normalizedDraft.repoFiles,
          agentsMd: {
            ...normalizedDraft.repoFiles.agentsMd,
            customContent: normalizedBase.repoFiles.agentsMd.customContent,
          },
        },
      })
    }
    return normalizeRuleConfig(draft)
  }

  const ruleKey = headRaw as RuleKey
  if (!RULE_ORDER.includes(ruleKey)) return normalizeRuleConfig(draft)

  const nextDraft: RuleConfig = {
    ...normalizedDraft,
    [ruleKey]: { ...normalizedDraft[ruleKey] },
  }

  const baseValue = normalizedBase[ruleKey][field as RuleField]
  if (baseValue === undefined) {
    delete (nextDraft[ruleKey] as Record<string, unknown>)[field]
  } else {
    ;(nextDraft[ruleKey] as Record<string, unknown>)[field] = baseValue
  }

  return normalizeRuleConfig(nextDraft)
}

export function describeRuleConfigChanges(
  previous: RuleConfig,
  next: RuleConfig
): string[] {
  return getRuleConfigChanges(previous, next).map((change) => change.label)
}
