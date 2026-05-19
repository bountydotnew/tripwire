import type { WorkflowNodeType } from "@tripwire/db"
import { RULE_META } from "@tripwire/db/schema/rule-meta"

export interface ParamCondition {
  field: string
  value: string | string[]
}

export interface ParamDefinition {
  key: string
  name: string
  type: "string" | "number" | "boolean" | "select"
  required?: boolean
  default?: unknown
  options?: { label: string; value: string }[]
  description?: string
  condition?: ParamCondition
}

export interface HandleDefinition {
  id: string
  type: "source" | "target"
  position: "top" | "bottom"
  label?: string
}

export interface NodeRegistryEntry {
  type: WorkflowNodeType
  subtype: string
  name: string
  category: string
  description: string
  definition?: string
  example?: string
  params: ParamDefinition[]
  handles: HandleDefinition[]
  hidden?: boolean
}

const sourceBottom = (id = "source", label?: string): HandleDefinition => ({
  id,
  type: "source",
  position: "bottom",
  label,
})

const targetTop = (id = "target"): HandleDefinition => ({
  id,
  type: "target",
  position: "top",
})

const triggerHandles: HandleDefinition[] = [sourceBottom()]

const ruleHandles: HandleDefinition[] = [
  targetTop(),
  sourceBottom("pass", "pass"),
  sourceBottom("fail", "fail"),
]

const conditionHandles: HandleDefinition[] = [
  targetTop(),
  sourceBottom("true", "true"),
  sourceBottom("false", "false"),
]

const logicHandles: HandleDefinition[] = [targetTop(), sourceBottom()]
const actionHandles: HandleDefinition[] = [targetTop()]
const delayHandles: HandleDefinition[] = [targetTop(), sourceBottom()]
const transformHandles: HandleDefinition[] = [targetTop(), sourceBottom()]

const TRIGGER_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "trigger",
    subtype: "pr_opened",
    name: "PR Opened",
    category: "Triggers",
    description: "Fires when a pull request is opened",
    definition: "Fires when a pull request is opened against the repo.",
    example: "Use as the starting point for PR screening workflows.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "pr_edited",
    name: "PR Edited",
    category: "Triggers",
    description: "Fires when a pull request is edited",
    definition: "Fires when an existing pull request is edited.",
    example:
      "Re-evaluate a PR after the author updates the title or description.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "issue_opened",
    name: "Issue Opened",
    category: "Triggers",
    description: "Fires when an issue is opened",
    definition: "Fires when a new issue is created.",
    example: "Screen new issues for spam or low-quality content.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "issue_edited",
    name: "Issue Edited",
    category: "Triggers",
    description: "Fires when an issue is edited",
    definition: "Fires when an existing issue is edited.",
    example: "Re-check issue content after edits for policy violations.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "comment_created",
    name: "Comment Created",
    category: "Triggers",
    description: "Fires when a comment is created on an issue or PR",
    definition: "Fires when a comment is posted on an issue or PR.",
    example: "Scan comments for crypto addresses or spam links.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "contributor_first_interaction",
    name: "First Interaction",
    category: "Triggers",
    description: "Fires on a contributor's first interaction with the repo",
    definition: "Fires the first time a user interacts with the repo.",
    example: "Run extra checks on brand-new contributors.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "schedule",
    name: "Schedule",
    category: "Triggers",
    description: "Run this workflow on a time-based schedule",
    definition: "Runs the workflow at a set time interval.",
    example: "Set to daily at 09:00 to scan for stale PRs every morning.",
    params: [
      {
        key: "scheduleType",
        name: "Run frequency",
        type: "select",
        required: true,
        default: "daily",
        options: [
          { label: "Every X Minutes", value: "minutes" },
          { label: "Hourly", value: "hourly" },
          { label: "Daily", value: "daily" },
          { label: "Weekly", value: "weekly" },
          { label: "Custom (Cron)", value: "custom" },
        ],
      },
      {
        key: "minutesInterval",
        name: "Interval (minutes)",
        type: "number",
        default: 15,
        description: "Run every N minutes",
        condition: { field: "scheduleType", value: "minutes" },
      },
      {
        key: "hourlyMinute",
        name: "Minute",
        type: "number",
        default: 0,
        description: "Minute of the hour (0-59)",
        condition: { field: "scheduleType", value: "hourly" },
      },
      {
        key: "dailyTime",
        name: "Time",
        type: "string",
        default: "09:00",
        description: "Time of day (HH:MM)",
        condition: { field: "scheduleType", value: "daily" },
      },
      {
        key: "weeklyDay",
        name: "Day of week",
        type: "select",
        default: "MON",
        options: [
          { label: "Monday", value: "MON" },
          { label: "Tuesday", value: "TUE" },
          { label: "Wednesday", value: "WED" },
          { label: "Thursday", value: "THU" },
          { label: "Friday", value: "FRI" },
          { label: "Saturday", value: "SAT" },
          { label: "Sunday", value: "SUN" },
        ],
        condition: { field: "scheduleType", value: "weekly" },
      },
      {
        key: "weeklyDayTime",
        name: "Time",
        type: "string",
        default: "09:00",
        description: "Time of day (HH:MM)",
        condition: { field: "scheduleType", value: "weekly" },
      },
      {
        key: "cronExpression",
        name: "Cron expression",
        type: "string",
        description: "Standard 5-field cron (e.g. 0 9 * * MON)",
        condition: { field: "scheduleType", value: "custom" },
      },
      {
        key: "timezone",
        name: "Timezone",
        type: "select",
        default: "UTC",
        options: [
          { label: "UTC", value: "UTC" },
          { label: "US Pacific (UTC-8)", value: "America/Los_Angeles" },
          { label: "US Mountain (UTC-7)", value: "America/Denver" },
          { label: "US Central (UTC-6)", value: "America/Chicago" },
          { label: "US Eastern (UTC-5)", value: "America/New_York" },
          { label: "London (UTC+0)", value: "Europe/London" },
          { label: "Berlin (UTC+1)", value: "Europe/Berlin" },
          { label: "Tokyo (UTC+9)", value: "Asia/Tokyo" },
          { label: "Sydney (UTC+10)", value: "Australia/Sydney" },
        ],
        condition: {
          field: "scheduleType",
          value: ["daily", "weekly", "custom"],
        },
      },
    ],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "schedule_daily",
    name: "Daily Schedule",
    category: "Triggers",
    description: "Fires once per day on a schedule",
    params: [],
    handles: triggerHandles,
    hidden: true,
  },
  {
    type: "trigger",
    subtype: "schedule_weekly",
    name: "Weekly Schedule",
    category: "Triggers",
    description: "Fires once per week on a schedule",
    params: [],
    handles: triggerHandles,
    hidden: true,
  },
  {
    type: "trigger",
    subtype: "manual",
    name: "Manual Run",
    category: "Triggers",
    description: "Fires when manually triggered by a user",
    definition: "Fires when a maintainer triggers the workflow by hand.",
    example: "Run a one-off scan against a specific contributor.",
    params: [],
    handles: triggerHandles,
  },
  {
    type: "trigger",
    subtype: "repo_scan",
    name: "Repo History Scan",
    category: "Triggers",
    description: "Scans repo history for past offenders",
    definition: "Scans repo history to find past offenders.",
    example: "Retroactively check existing PRs against new rules.",
    params: [],
    handles: triggerHandles,
  },
]

const RULE_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "rule",
    subtype: "accountAge",
    name: RULE_META.accountAge.name,
    category: "Rules",
    description: RULE_META.accountAge.description,
    definition: "Checks if the contributor's GitHub account is old enough.",
    example: "Set minimum to 30 days to filter out throwaway accounts.",
    params: [
      {
        key: "days",
        name: "Minimum account age (days)",
        type: "number",
        default: 30,
        description: "Minimum number of days since account creation",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "minMergedPrs",
    name: RULE_META.minMergedPrs.name,
    category: "Rules",
    description: RULE_META.minMergedPrs.description,
    definition:
      "Checks if the contributor has enough merged PRs across GitHub.",
    example:
      "Require at least 15 merged PRs to prove real contribution history.",
    params: [
      {
        key: "count",
        name: "Minimum merged PRs",
        type: "number",
        default: 15,
        description: "Required number of merged PRs across GitHub",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "requireProfileReadme",
    name: RULE_META.requireProfileReadme.name,
    category: "Rules",
    description: RULE_META.requireProfileReadme.description,
    definition: "Checks if the contributor has a profile README.",
    example: "Accounts without a profile README are more likely to be bots.",
    params: [],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "repoActivityMinimum",
    name: RULE_META.repoActivityMinimum.name,
    category: "Rules",
    description: RULE_META.repoActivityMinimum.description,
    definition: "Checks if the contributor owns enough public repos.",
    example: "Require at least 3 non-fork repos to show genuine activity.",
    params: [
      {
        key: "minRepos",
        name: "Minimum public repos",
        type: "number",
        default: 3,
        description: "Minimum number of public non-fork repositories",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "maxPrsPerDay",
    name: RULE_META.maxPrsPerDay.name,
    category: "Rules",
    description: RULE_META.maxPrsPerDay.description,
    definition: "Flags contributors who open too many PRs in a single day.",
    example: "Set limit to 5 to catch spam PR floods.",
    params: [
      {
        key: "limit",
        name: "Maximum PRs per day",
        type: "number",
        default: 5,
        description: "Maximum pull requests a single user can open per day",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "maxFilesChanged",
    name: RULE_META.maxFilesChanged.name,
    category: "Rules",
    description: RULE_META.maxFilesChanged.description,
    definition: "Flags PRs that touch too many files at once.",
    example: "Set limit to 20 files to catch bulk-edit spam PRs.",
    params: [
      {
        key: "limit",
        name: "Maximum files changed",
        type: "number",
        default: 20,
        description: "Maximum number of files a PR can touch",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "language",
    name: RULE_META.languageRequirement.name,
    category: "Rules",
    description: RULE_META.languageRequirement.description,
    definition:
      "Checks if the PR or issue content is in the required language.",
    example: "Set to English to filter non-English contributions.",
    params: [
      {
        key: "language",
        name: "Language",
        type: "select",
        default: "en",
        options: [
          { label: "English (en)", value: "en" },
          { label: "Spanish (es)", value: "es" },
          { label: "French (fr)", value: "fr" },
          { label: "German (de)", value: "de" },
          { label: "Portuguese (pt)", value: "pt" },
          { label: "Chinese (zh)", value: "zh" },
          { label: "Japanese (ja)", value: "ja" },
          { label: "Korean (ko)", value: "ko" },
          { label: "Russian (ru)", value: "ru" },
          { label: "Arabic (ar)", value: "ar" },
          { label: "Hindi (hi)", value: "hi" },
          { label: "Custom", value: "custom" },
        ],
      },
      {
        key: "languageCode",
        name: "Unicode script/tag",
        type: "string",
        description:
          "ISO 639-1 code or Unicode script name (e.g. Cyrl, Latn, Hani)",
        condition: { field: "language", value: "custom" },
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "crypto",
    name: RULE_META.cryptoAddressDetection.name,
    category: "Rules",
    description: RULE_META.cryptoAddressDetection.description,
    definition: "Detects crypto wallet addresses in PR or issue content.",
    example: "Catches spam PRs that try to inject crypto addresses.",
    params: [],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "vouchedUsersOnly",
    name: RULE_META.vouchedUsersOnly.name,
    category: "Rules",
    description: RULE_META.vouchedUsersOnly.description,
    definition: "Only allows contributions from vouched/whitelisted users.",
    example: "Set scope to repo whitelist for strict contributor gating.",
    params: [
      {
        key: "vouchScope",
        name: "Vouch scope",
        type: "select",
        default: "repo",
        options: [
          { label: "Repo whitelist only", value: "repo" },
          { label: "Global vouches only", value: "global" },
          { label: "Both", value: "both" },
        ],
        description: "Which vouch source to check",
      },
    ],
    handles: ruleHandles,
  },
  {
    type: "rule",
    subtype: "aiHoneypot",
    name: RULE_META.aiHoneypot.name,
    category: "Rules",
    description: RULE_META.aiHoneypot.description,
    definition:
      "Detects AI-generated PRs using honeypot signals in repo files.",
    example: "Add hidden instructions in CONTRIBUTING.md that AI tools follow.",
    params: [],
    handles: ruleHandles,
  },
]

const CONDITION_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "condition",
    subtype: "custom",
    name: "Condition",
    category: "Conditions",
    description: "Compare a field against a value using an operator",
    definition: "Compares a data field against a value using an operator.",
    example:
      "Check if score > 50 to split the workflow into pass/fail branches.",
    params: [
      {
        key: "field",
        name: "Field",
        type: "select",
        required: true,
        default: "score",
        options: [
          { label: "Score", value: "score" },
          { label: "Account Age (days)", value: "accountAgeDays" },
          { label: "Public Repos", value: "publicRepos" },
          { label: "Non-Fork Repos", value: "publicNonForkRepos" },
          { label: "Followers", value: "followers" },
          { label: "Following", value: "following" },
          { label: "Public Gists", value: "publicGists" },
          { label: "Merged PRs", value: "mergedPrs" },
          { label: "Has Profile README", value: "hasProfileReadme" },
          { label: "Files Changed", value: "filesChanged" },
          { label: "Username", value: "username" },
        ],
        description: "The data field to evaluate",
      },
      {
        key: "operator",
        name: "Operator",
        type: "select",
        required: true,
        default: ">",
        options: [
          { label: ">", value: ">" },
          { label: ">=", value: ">=" },
          { label: "<", value: "<" },
          { label: "<=", value: "<=" },
          { label: "==", value: "==" },
          { label: "!=", value: "!=" },
          { label: "matches", value: "matches" },
        ],
        description: "Comparison operator",
      },
      {
        key: "value",
        name: "Value",
        type: "string",
        required: true,
        default: "50",
        description: "The value to compare against",
      },
    ],
    handles: conditionHandles,
  },
]

const LOGIC_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "logic",
    subtype: "AND",
    name: "AND Gate",
    category: "Logic Gates",
    description: "All inputs must pass for output to pass",
    definition: "Passes only when all connected inputs pass.",
    example: "Connect Account Age + Merged PRs to require both checks.",
    params: [{ key: "gate", name: "Gate", type: "string", default: "AND" }],
    handles: logicHandles,
  },
  {
    type: "logic",
    subtype: "OR",
    name: "OR Gate",
    category: "Logic Gates",
    description: "Any input passing causes output to pass",
    definition: "Passes when any connected input passes.",
    example: "Connect Whitelist + Score Check so either one grants access.",
    params: [{ key: "gate", name: "Gate", type: "string", default: "OR" }],
    handles: logicHandles,
  },
  {
    type: "logic",
    subtype: "NOT",
    name: "NOT Gate",
    category: "Logic Gates",
    description: "Inverts the input result",
    definition: "Inverts the result of its input.",
    example: "Flip a passing rule into a fail condition for exclusion logic.",
    params: [{ key: "gate", name: "Gate", type: "string", default: "NOT" }],
    handles: logicHandles,
  },
]

const ACTION_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "action",
    subtype: "block",
    name: "Block",
    category: "Actions",
    description: "Close the PR/issue immediately",
    definition: "Closes the PR or issue immediately.",
    example: "Use after a rule fails to auto-close spam PRs with a message.",
    params: [
      {
        key: "message",
        name: "Message",
        type: "string",
        description: "Optional message to include when blocking",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "warn",
    name: "Warn",
    category: "Actions",
    description: "Leave a warning comment but keep the content open",
    definition: "Posts a warning comment but keeps the content open.",
    example: "Warn new contributors about missing profile info.",
    params: [
      {
        key: "message",
        name: "Message",
        type: "string",
        description: "Warning message text",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "log",
    name: "Log Event",
    category: "Actions",
    description: "Record the event silently without taking any GitHub action",
    definition: "Records the event silently without any GitHub action.",
    example: "Log suspicious activity for later review without blocking.",
    params: [
      {
        key: "message",
        name: "Message",
        type: "string",
        description: "Log message",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "close",
    name: "Close",
    category: "Actions",
    description: "Close the PR or issue",
    definition: "Closes the PR or issue without posting a comment.",
    example: "Silently close PRs from blacklisted accounts.",
    params: [],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "label",
    name: "Add Label",
    category: "Actions",
    description: "Add a label to the PR or issue",
    definition: "Adds a label to the PR or issue.",
    example: "Add a needs-review label to flag PRs from new contributors.",
    params: [
      {
        key: "label",
        name: "Label",
        type: "string",
        required: true,
        description: "Label name to add",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "comment",
    name: "Comment",
    category: "Actions",
    description: "Post a comment on the PR or issue",
    definition: "Posts a comment on the PR or issue.",
    example: "Welcome first-time contributors with repo guidelines.",
    params: [
      {
        key: "message",
        name: "Message",
        type: "string",
        required: true,
        description: "Comment body text",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "add_to_whitelist",
    name: "Whitelist",
    category: "Actions",
    description: "Add the contributor to the repo whitelist",
    definition: "Adds the contributor to the repo whitelist.",
    example: "Auto-whitelist users who pass all rule checks.",
    params: [],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "add_to_blacklist",
    name: "Blacklist",
    category: "Actions",
    description: "Add the contributor to the repo blacklist",
    definition: "Adds the contributor to the repo blacklist.",
    example: "Blacklist repeat offenders caught by multiple rules.",
    params: [],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "remove_from_whitelist",
    name: "Remove Whitelist",
    category: "Actions",
    description: "Remove the contributor from the repo whitelist",
    definition: "Removes the contributor from the repo whitelist.",
    example: "Revoke whitelist status when a user starts failing checks.",
    params: [],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "remove_from_blacklist",
    name: "Remove Blacklist",
    category: "Actions",
    description: "Remove the contributor from the repo blacklist",
    definition: "Removes the contributor from the repo blacklist.",
    example: "Unblock a user after an appeal is approved.",
    params: [],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "notify_slack",
    name: "Notify Slack",
    category: "Actions",
    description: "Send a notification to a Slack webhook",
    definition: "Sends a notification to a Slack webhook.",
    example: "Alert your team channel when a suspicious PR is detected.",
    params: [
      {
        key: "url",
        name: "Webhook URL",
        type: "string",
        required: true,
        description: "Slack incoming webhook URL",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "notify_discord",
    name: "Notify Discord",
    category: "Actions",
    description: "Send a notification to a Discord webhook",
    definition: "Sends a notification to a Discord webhook.",
    example: "Post to your moderation channel when rules trigger.",
    params: [
      {
        key: "url",
        name: "Webhook URL",
        type: "string",
        required: true,
        description: "Discord webhook URL",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "send_webhook",
    name: "Send Webhook",
    category: "Actions",
    description: "Send an HTTP POST to a custom webhook URL",
    definition: "Sends an HTTP POST to a custom webhook URL.",
    example: "Forward event data to your own API for custom processing.",
    params: [
      {
        key: "url",
        name: "Webhook URL",
        type: "string",
        required: true,
        description: "Target URL for the webhook POST",
      },
    ],
    handles: actionHandles,
  },
  {
    type: "action",
    subtype: "request_review",
    name: "Request Review",
    category: "Actions",
    description: "Request a review from a specified user or team",
    definition: "Requests a review from a specified user or team.",
    example: "Auto-assign a reviewer when a PR touches sensitive files.",
    params: [],
    handles: actionHandles,
  },
]

const DELAY_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "delay",
    subtype: "wait",
    name: "Delay",
    category: "Delays",
    description: "Wait for a configurable duration before proceeding",
    definition: "Pauses the workflow for a set duration before continuing.",
    example: "Wait 5 minutes before re-checking a contributor's profile data.",
    params: [
      {
        key: "durationValue",
        name: "Duration",
        type: "number",
        default: 5,
        required: true,
        description: "How long to wait",
      },
      {
        key: "durationUnit",
        name: "Unit",
        type: "select",
        default: "m",
        required: true,
        options: [
          { label: "Seconds", value: "s" },
          { label: "Minutes", value: "m" },
          { label: "Hours", value: "h" },
          { label: "Days", value: "d" },
        ],
      },
    ],
    handles: delayHandles,
  },
]

const TRANSFORM_ENTRIES: NodeRegistryEntry[] = [
  {
    type: "transform",
    subtype: "fetch_github_user",
    name: "Fetch GitHub User",
    category: "Transforms",
    description:
      "Enrich the workflow context with the contributor's GitHub profile data",
    definition: "Fetches the contributor's GitHub profile data.",
    example: "Place before rule checks that need account age or repo count.",
    params: [],
    handles: transformHandles,
  },
  {
    type: "transform",
    subtype: "compute_score",
    name: "Compute Score",
    category: "Transforms",
    description: "Calculate the contributor's Tripwire reputation score",
    definition: "Calculates the contributor's Tripwire reputation score.",
    example: "Use before a condition node to branch on score thresholds.",
    params: [],
    handles: transformHandles,
  },
  {
    type: "transform",
    subtype: "fetch_pr_files",
    name: "Fetch PR Files",
    category: "Transforms",
    description: "Get the list of files changed in the pull request",
    definition: "Gets the list of files changed in the pull request.",
    example: "Use before a file count check or sensitive path detection.",
    params: [],
    handles: transformHandles,
  },
  {
    type: "transform",
    subtype: "scan_history",
    name: "Scan History",
    category: "Transforms",
    description: "Check the repo's event history for the contributor",
    definition: "Checks the repo's event history for the contributor.",
    example: "Look up whether this user has been flagged before.",
    params: [],
    handles: transformHandles,
  },
  {
    type: "transform",
    subtype: "detect_language",
    name: "Detect Language",
    category: "Transforms",
    description: "Analyze content language for language requirement checks",
    definition: "Analyzes the content language of the PR or issue.",
    example: "Use before a language rule to detect non-English contributions.",
    params: [],
    handles: transformHandles,
  },
]

export const NODE_REGISTRY: NodeRegistryEntry[] = [
  ...TRIGGER_ENTRIES,
  ...RULE_ENTRIES,
  ...CONDITION_ENTRIES,
  ...LOGIC_ENTRIES,
  ...ACTION_ENTRIES,
  ...DELAY_ENTRIES,
  ...TRANSFORM_ENTRIES,
]

export function getNodeEntry(
  type: WorkflowNodeType,
  subtype: string
): NodeRegistryEntry | undefined {
  return NODE_REGISTRY.find(
    (entry) => entry.type === type && entry.subtype === subtype
  )
}

export function getNodesByCategory(
  category?: string
): Map<string, NodeRegistryEntry[]> {
  const map = new Map<string, NodeRegistryEntry[]>()
  for (const entry of NODE_REGISTRY) {
    if (category && entry.category !== category) continue
    const list = map.get(entry.category) ?? []
    list.push(entry)
    map.set(entry.category, list)
  }
  return map
}

export function validateNodeData(
  type: WorkflowNodeType,
  subtype: string,
  data: Record<string, unknown>
): { valid: boolean; errors: string[] } {
  const entry = getNodeEntry(type, subtype)
  if (!entry) {
    return { valid: false, errors: [`Unknown node type: ${type}/${subtype}`] }
  }

  const errors: string[] = []
  for (const param of entry.params) {
    if (!param.required) continue
    const value = data[param.key]
    if (value === undefined || value === null || value === "") {
      errors.push(`Missing required param: ${param.key}`)
    }
  }

  return { valid: errors.length === 0, errors }
}
