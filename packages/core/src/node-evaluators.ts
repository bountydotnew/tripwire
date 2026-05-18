export interface ContextField {
  key: string;
  label: string;
  type: "number" | "string" | "boolean";
  source: "user" | "content" | "manual";
  default?: unknown;
}

export interface EvalResult {
  pass: boolean;
  detail: string;
  pauseMs?: number;
  producedContext?: Record<string, unknown>;
}

export interface NodeEvaluator {
  requiredContext: ContextField[];
  evaluate(
    nodeData: Record<string, unknown>,
    ctx: Record<string, unknown>,
  ): EvalResult;
}

type EvaluatorKey = string;

function key(type: string, subtype: string): EvaluatorKey {
  return `${type}/${subtype}`;
}

const registry = new Map<EvaluatorKey, NodeEvaluator>();

function register(type: string, subtype: string, evaluator: NodeEvaluator) {
  registry.set(key(type, subtype), evaluator);
}

export function getEvaluator(
  type: string,
  subtype: string,
): NodeEvaluator | undefined {
  return registry.get(key(type, subtype));
}

export function getEvaluatorForNode(
  type: string,
  data: Record<string, unknown>,
): NodeEvaluator | undefined {
  const subtype = resolveSubtype(type, data);
  return getEvaluator(type, subtype);
}

function resolveSubtype(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "trigger":
      return (data.trigger as string) ?? "manual";
    case "rule":
      return (data.rule as string) ?? "accountAge";
    case "condition":
      return "custom";
    case "logic":
      return (data.gate as string) ?? "AND";
    case "action":
      return (data.action as string) ?? "block";
    case "delay":
      return "wait";
    case "transform":
      return (data.transform as string) ?? "fetch_github_user";
    default:
      return "unknown";
  }
}

function num(ctx: Record<string, unknown>, key: string, fallback = 0): number {
  const v = ctx[key];
  return typeof v === "number" ? v : fallback;
}

function bool(ctx: Record<string, unknown>, key: string): boolean {
  return ctx[key] === true || ctx[key] === "true";
}

function str(ctx: Record<string, unknown>, key: string): string {
  const v = ctx[key];
  return typeof v === "string" ? v : String(v ?? "");
}

function parseDurationMs(duration: string): number {
  const match = duration.match(/^(\d+)\s*(s|m|h|d)$/i);
  if (!match) return 5000;
  const value = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60_000;
    case "h":
      return value * 3_600_000;
    case "d":
      return value * 86_400_000;
    default:
      return 5000;
  }
}

// ── Triggers ──

for (const trigger of [
  "pr_opened",
  "pr_edited",
  "issue_opened",
  "issue_edited",
  "comment_created",
  "contributor_first_interaction",
  "schedule",
  "schedule_daily",
  "schedule_weekly",
  "manual",
  "repo_scan",
]) {
  register("trigger", trigger, {
    requiredContext: [],
    evaluate(_data) {
      return { pass: true, detail: `Triggered: ${trigger}` };
    },
  });
}

// ── Rules ──

register("rule", "accountAge", {
  requiredContext: [
    { key: "accountAgeDays", label: "Account age (days)", type: "number", source: "user", default: 0 },
  ],
  evaluate(data, ctx) {
    const threshold = (data.params as Record<string, unknown>)?.days as number ?? 30;
    const actual = num(ctx, "accountAgeDays");
    const pass = actual >= threshold;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- account is ${actual}d old (requires >= ${threshold}d)` };
  },
});

register("rule", "minMergedPrs", {
  requiredContext: [
    { key: "mergedPrs", label: "Merged PRs", type: "number", source: "user", default: 0 },
  ],
  evaluate(data, ctx) {
    const threshold = (data.params as Record<string, unknown>)?.count as number ?? 15;
    const actual = num(ctx, "mergedPrs");
    const pass = actual >= threshold;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- ${actual} merged PRs (requires >= ${threshold})` };
  },
});

register("rule", "requireProfileReadme", {
  requiredContext: [
    { key: "hasProfileReadme", label: "Has profile README", type: "boolean", source: "user", default: false },
  ],
  evaluate(_data, ctx) {
    const pass = bool(ctx, "hasProfileReadme");
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- profile README ${pass ? "exists" : "missing"}` };
  },
});

register("rule", "repoActivityMinimum", {
  requiredContext: [
    { key: "publicNonForkRepos", label: "Public non-fork repos", type: "number", source: "user", default: 0 },
  ],
  evaluate(data, ctx) {
    const threshold = (data.params as Record<string, unknown>)?.minRepos as number ?? 3;
    const actual = num(ctx, "publicNonForkRepos");
    const pass = actual >= threshold;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- ${actual} non-fork repos (requires >= ${threshold})` };
  },
});

register("rule", "maxPrsPerDay", {
  requiredContext: [
    { key: "prsToday", label: "PRs opened today", type: "number", source: "manual", default: 1 },
  ],
  evaluate(data, ctx) {
    const limit = (data.params as Record<string, unknown>)?.limit as number ?? 5;
    const actual = num(ctx, "prsToday", 1);
    const pass = actual <= limit;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- ${actual} PRs today (limit: ${limit})` };
  },
});

register("rule", "maxFilesChanged", {
  requiredContext: [
    { key: "filesChanged", label: "Files changed", type: "number", source: "user", default: 0 },
  ],
  evaluate(data, ctx) {
    const limit = (data.params as Record<string, unknown>)?.limit as number ?? 20;
    const actual = num(ctx, "filesChanged");
    const pass = actual <= limit;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- ${actual} files changed (limit: ${limit})` };
  },
});

register("rule", "language", {
  requiredContext: [
    { key: "contentText", label: "Content text", type: "string", source: "content", default: "" },
  ],
  evaluate(data, ctx) {
    const required = (data.params as Record<string, unknown>)?.language as string ?? "English";
    const text = str(ctx, "contentText");
    if (!text) return { pass: true, detail: "SKIP -- no content text provided" };
    const looksEnglish = /^[a-zA-Z0-9\s.,!?;:'"()\-\n]+$/.test(text.slice(0, 200));
    const pass = required === "English" ? looksEnglish : true;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- content ${pass ? "matches" : "does not match"} ${required}` };
  },
});

register("rule", "crypto", {
  requiredContext: [
    { key: "contentText", label: "Content text", type: "string", source: "content", default: "" },
  ],
  evaluate(_data, ctx) {
    const text = str(ctx, "contentText");
    if (!text) return { pass: true, detail: "SKIP -- no content text provided" };
    const cryptoPattern = /\b(0x[a-fA-F0-9]{40}|[13][a-km-zA-HJ-NP-Z1-9]{25,34}|bc1[a-z0-9]{39,59})\b/;
    const found = cryptoPattern.test(text);
    return { pass: !found, detail: found ? "FAIL -- crypto address detected in content" : "PASS -- no crypto addresses found" };
  },
});

register("rule", "aiHoneypot", {
  requiredContext: [
    { key: "contentText", label: "Content text", type: "string", source: "content", default: "" },
  ],
  evaluate(_data, ctx) {
    const text = str(ctx, "contentText");
    if (!text) return { pass: true, detail: "SKIP -- no content text to analyze" };
    return { pass: true, detail: "PASS -- honeypot check requires repo file analysis" };
  },
});

register("rule", "vouchedUsersOnly", {
  requiredContext: [
    { key: "isVouched", label: "User is vouched/whitelisted", type: "boolean", source: "manual", default: false },
  ],
  evaluate(_data, ctx) {
    const pass = bool(ctx, "isVouched");
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- user ${pass ? "is" : "is not"} vouched` };
  },
});

register("rule", "contributorScore", {
  requiredContext: [
    { key: "score", label: "Contributor score", type: "number", source: "user", default: 0 },
  ],
  evaluate(data, ctx) {
    const threshold = (data.params as Record<string, unknown>)?.minScore as number ?? 50;
    const actual = num(ctx, "score");
    const pass = actual >= threshold;
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- score is ${actual} (requires >= ${threshold})` };
  },
});

// ── Condition ──

register("condition", "custom", {
  requiredContext: [],
  evaluate(data, ctx) {
    const field = data.field as string ?? "score";
    const operator = data.operator as string ?? ">";
    const value = String(data.value ?? "0");
    const actual = ctx[field];

    if (actual === undefined) {
      return { pass: true, detail: `SKIP -- field "${field}" not in context` };
    }

    let pass: boolean;
    if (typeof actual === "boolean") {
      pass = actual === (value === "true");
    } else if (typeof actual === "string") {
      if (operator === "matches") {
        try {
          pass = new RegExp(value).test(actual);
        } catch {
          pass = actual.includes(value);
        }
      } else {
        pass = operator === "==" ? actual === value : actual !== value;
      }
    } else {
      const numActual = Number(actual);
      const numValue = parseFloat(value);
      switch (operator) {
        case ">": pass = numActual > numValue; break;
        case ">=": pass = numActual >= numValue; break;
        case "<": pass = numActual < numValue; break;
        case "<=": pass = numActual <= numValue; break;
        case "==": pass = numActual === numValue; break;
        case "!=": pass = numActual !== numValue; break;
        default: pass = true;
      }
    }
    return { pass, detail: `${pass ? "PASS" : "FAIL"} -- ${field} is ${actual} (check: ${operator} ${value})` };
  },
});

// ── Logic ──

for (const gate of ["AND", "OR", "NOT"] as const) {
  register("logic", gate, {
    requiredContext: [],
    evaluate() {
      return { pass: true, detail: `${gate} -- evaluated by executor` };
    },
  });
}

// ── Transforms ──

register("transform", "fetch_github_user", {
  requiredContext: [
    { key: "accountAgeDays", label: "Account age (days)", type: "number", source: "user", default: 0 },
    { key: "followers", label: "Followers", type: "number", source: "user", default: 0 },
    { key: "following", label: "Following", type: "number", source: "user", default: 0 },
    { key: "publicRepos", label: "Public repos", type: "number", source: "user", default: 0 },
    { key: "publicNonForkRepos", label: "Public non-fork repos", type: "number", source: "user", default: 0 },
    { key: "publicGists", label: "Public gists", type: "number", source: "user", default: 0 },
    { key: "hasProfileReadme", label: "Has profile README", type: "boolean", source: "user", default: false },
  ],
  evaluate(_data, ctx) {
    return {
      pass: true,
      detail: `Fetched profile: ${num(ctx, "accountAgeDays")}d old, ${num(ctx, "publicRepos")} repos, ${num(ctx, "followers")} followers`,
      producedContext: {
        accountAgeDays: num(ctx, "accountAgeDays"),
        followers: num(ctx, "followers"),
        following: num(ctx, "following"),
        publicRepos: num(ctx, "publicRepos"),
        publicNonForkRepos: num(ctx, "publicNonForkRepos"),
        publicGists: num(ctx, "publicGists"),
        hasProfileReadme: bool(ctx, "hasProfileReadme"),
      },
    };
  },
});

register("transform", "compute_score", {
  requiredContext: [
    { key: "score", label: "Contributor score", type: "number", source: "user", default: 50 },
  ],
  evaluate(_data, ctx) {
    const score = num(ctx, "score", 50);
    return {
      pass: true,
      detail: `Computed score: ${score}/100`,
      producedContext: { score },
    };
  },
});

register("transform", "fetch_pr_files", {
  requiredContext: [
    { key: "filesChanged", label: "Files changed", type: "number", source: "user", default: 5 },
  ],
  evaluate(_data, ctx) {
    const count = num(ctx, "filesChanged", 5);
    return {
      pass: true,
      detail: `Fetched ${count} changed files`,
      producedContext: { filesChanged: count },
    };
  },
});

register("transform", "scan_history", {
  requiredContext: [],
  evaluate() {
    return { pass: true, detail: "Scanned repo history" };
  },
});

register("transform", "detect_language", {
  requiredContext: [
    { key: "contentText", label: "Content text", type: "string", source: "content", default: "" },
  ],
  evaluate(_data, ctx) {
    const text = str(ctx, "contentText");
    if (!text) return { pass: true, detail: "No content to analyze" };
    const looksEnglish = /^[a-zA-Z0-9\s.,!?;:'"()\-\n]+$/.test(text.slice(0, 200));
    return {
      pass: true,
      detail: `Detected language: ${looksEnglish ? "English" : "non-English"}`,
      producedContext: { detectedLanguage: looksEnglish ? "English" : "other" },
    };
  },
});

// ── Delay ──

register("delay", "wait", {
  requiredContext: [],
  evaluate(data) {
    const duration = (data.duration as string) ?? "5m";
    const ms = parseDurationMs(duration);
    return {
      pass: true,
      detail: `Delay: waiting ${duration}...`,
      pauseMs: Math.min(ms, 10_000),
    };
  },
});

// ── Actions ──

for (const action of [
  "block", "warn", "log", "close", "label", "comment",
  "add_to_whitelist", "add_to_blacklist",
  "remove_from_whitelist", "remove_from_blacklist",
  "notify_slack", "notify_discord", "send_webhook", "request_review",
]) {
  register("action", action, {
    requiredContext: [],
    evaluate(data) {
      let detail = `Execute: ${action}`;
      if (data.message) detail += ` -- "${data.message}"`;
      if (data.label) detail += ` -- label "${data.label}"`;
      if (data.url) detail += ` -- ${data.url}`;
      return { pass: true, detail };
    },
  });
}

export { resolveSubtype };
