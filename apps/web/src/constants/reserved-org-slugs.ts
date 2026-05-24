// Slugs a user-created Better Auth org cannot pick because they'd either
// shadow a real route in the app or land on a slug we want to keep claim
// over for system / brand reasons. Check is case-insensitive.

const ROUTE_SLUGS = [
  "api",
  "oauth",
  "well-known",
  "login",
  "vouched",
  "request",
  "onboarding",
  "settings",
  "home",
  "rules",
  "events",
  "insights",
  "integrations",
  "automations",
  "visibility",
  "chat",
  "users",
  "search",
  "admin",
] as const

const SYSTEM_SLUGS = [
  "www",
  "app",
  "mail",
  "email",
  "smtp",
  "pop",
  "imap",
  "ftp",
  "support",
  "help",
  "helpdesk",
  "staff",
  "team",
  "docs",
  "documentation",
  "blog",
  "news",
  "about",
  "contact",
  "terms",
  "privacy",
  "legal",
  "security",
  "status",
  "health",
  "metrics",
  "dashboard",
  "console",
  "root",
  "system",
  "static",
  "assets",
  "cdn",
  "public",
  "private",
  "internal",
  "external",
  "test",
  "staging",
  "prod",
  "production",
  "dev",
  "development",
  "localhost",
  "null",
  "undefined",
  "new",
  "create",
  "delete",
  "edit",
  "update",
  "_",
] as const

const BRAND_SLUGS = [
  "tripwire",
  "tripwire-app",
  "tripwire-official",
  "official",
  "bountydotnew",
  "bounty",
  "bounty-new",
  "coderabbit",
  "orchid",
  "linux",
  "theo",
  "lawn",
  "picthing",
  "github",
  "inth",
  "databuddy",
  "bun",
  "npm",
  "openclaw",
  "opencode",
  "anthropic",
  "openai",
  "claude",
  "gpt",
  "codex",
  "ai",
  "firecrawl",
] as const

export const RESERVED_ORG_SLUGS: readonly string[] = [
  ...ROUTE_SLUGS,
  ...SYSTEM_SLUGS,
  ...BRAND_SLUGS,
]

const RESERVED_SET = new Set(RESERVED_ORG_SLUGS.map((s) => s.toLowerCase()))

export function isReservedOrgSlug(slug: string): boolean {
  return RESERVED_SET.has(slug.trim().toLowerCase())
}

/** Github-handle style: starts with alnum, lower alnum + hyphens, 1-39 chars. */
export const ORG_SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,38})$/

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 39)
}
