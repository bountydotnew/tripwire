/**
 * Slash command registry for the Ask Tripwire chat input.
 *
 * Commands run directly without invoking the AI. There are three kinds:
 *   - "client"   : pure UI actions like /clear, /new, /help
 *   - "read"     : resolve a directInvokable tool server-side (chats.runSlashCommand)
 *   - "mutation" : show a confirmation card, then hit a tRPC mutation. The
 *                  result becomes an ActionResult assistant message.
 *
 * Tools used by reads must have `directInvokable: true` in their definition
 * (see packages/tools/src/definitions/*).
 */

export type CommandKind = "client" | "read" | "mutation"

export type MutationKind =
  | "blacklist.add"
  | "blacklist.remove"
  | "whitelist.add"
  | "whitelist.remove"

export interface SlashCommand {
  /** Includes the leading slash, e.g. "/lookup". */
  command: string
  /** Short label shown in the palette. */
  label: string
  /** One-line description shown in the palette. */
  description: string
  /** Optional example shown when the command is highlighted. */
  example?: string
  kind: CommandKind

  /** Whether the user must supply text after the command. */
  requiresArg?: boolean

  /** For `read`: the tool name. */
  tool?: string
  /** For `read`: build the tool args from the raw arg string. */
  buildArgs?: (raw: string) => Record<string, unknown>

  /** For `mutation`: which tRPC mutation to run on confirm. */
  mutation?: MutationKind
  /** For `mutation`: build a confirmation card from the raw arg string. */
  buildConfirm?: (raw: string) => MutationConfirmation
}

export interface MutationConfirmation {
  mutation: MutationKind
  username: string
  title: string
  description: string
  confirmLabel: string
  danger: boolean
}

/** Strip leading "@" so users can type either form. */
function normalizeUsername(raw: string): string {
  return raw.trim().replace(/^@/, "")
}

/**
 * Extract GitHub `@login` mentions in order (case-insensitive de-dupe on lower).
 */
export function extractGithubMentionTokens(raw: string): string[] {
  const re = /@([a-z\d](?:[a-z\d-]*[a-z\d])?)/gi
  const out: string[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const login = m[1]
    const key = login.toLowerCase()
    if (!login || seen.has(key)) continue
    seen.add(key)
    out.push(login)
  }
  return out
}

export function lookupSlashUsernameArgs(raw: string): string[] {
  const fromAt = extractGithubMentionTokens(raw)
  if (fromAt.length > 0) {
    return fromAt.slice(0, 24)
  }
  const single = normalizeUsername(raw)
  return single ? [single] : []
}

export const CHAT_COMMANDS: readonly SlashCommand[] = [
  {
    command: "/help",
    label: "Help",
    description: "Show available slash commands",
    kind: "client",
  },
  {
    command: "/clear",
    label: "Clear chat",
    description: "Clear the current conversation",
    kind: "client",
  },
  {
    command: "/new",
    label: "New chat",
    description: "Start a fresh conversation",
    kind: "client",
  },
  {
    command: "/rules",
    label: "Show rules",
    description: "Display the current moderation rules",
    kind: "read",
    tool: "get_repo_rules",
    buildArgs: () => ({}),
  },
  {
    command: "/lists",
    label: "Show lists",
    description: "Show whitelist and blacklist for this repo",
    kind: "read",
    tool: "list_lists",
    buildArgs: () => ({}),
  },
  {
    command: "/events",
    label: "Recent events",
    description: "Show recent webhook activity and rule triggers",
    kind: "read",
    tool: "list_events",
    buildArgs: () => ({ limit: 20 }),
  },
  {
    command: "/lookup",
    label: "Lookup user",
    description: "Investigate a contributor's profile, score, and activity",
    example: "/lookup @alice @bob",
    kind: "read",
    requiresArg: true,
    tool: "lookup_users",
    buildArgs: (raw) => ({ usernames: lookupSlashUsernameArgs(raw) }),
  },
  {
    command: "/check",
    label: "Check user",
    description: "Check if a user is on the blacklist or whitelist",
    example: "/check @username",
    kind: "read",
    requiresArg: true,
    tool: "check_lists",
    buildArgs: (raw) => ({ username: normalizeUsername(raw) }),
  },
  {
    command: "/block",
    label: "Blacklist user",
    description: "Add a user to the blacklist (requires confirmation)",
    example: "/block @username",
    kind: "mutation",
    requiresArg: true,
    mutation: "blacklist.add",
    buildConfirm: (raw) => {
      const username = normalizeUsername(raw)
      return {
        mutation: "blacklist.add",
        username,
        title: `Blacklist @${username}?`,
        description:
          "All future PRs, issues, and comments from this user will be blocked.",
        confirmLabel: "Blacklist",
        danger: true,
      }
    },
  },
  {
    command: "/unblock",
    label: "Remove from blacklist",
    description: "Remove a user from the blacklist",
    example: "/unblock @username",
    kind: "mutation",
    requiresArg: true,
    mutation: "blacklist.remove",
    buildConfirm: (raw) => {
      const username = normalizeUsername(raw)
      return {
        mutation: "blacklist.remove",
        username,
        title: `Remove @${username} from the blacklist?`,
        description:
          "Their future contributions will go through the normal rule pipeline again.",
        confirmLabel: "Remove",
        danger: false,
      }
    },
  },
  {
    command: "/allow",
    label: "Whitelist user",
    description: "Add a user to the whitelist (bypasses all rules)",
    example: "/allow @username",
    kind: "mutation",
    requiresArg: true,
    mutation: "whitelist.add",
    buildConfirm: (raw) => {
      const username = normalizeUsername(raw)
      return {
        mutation: "whitelist.add",
        username,
        title: `Whitelist @${username}?`,
        description: "All rule checks will be skipped for this user.",
        confirmLabel: "Whitelist",
        danger: false,
      }
    },
  },
  {
    command: "/disallow",
    label: "Remove from whitelist",
    description: "Remove a user from the whitelist",
    example: "/disallow @username",
    kind: "mutation",
    requiresArg: true,
    mutation: "whitelist.remove",
    buildConfirm: (raw) => {
      const username = normalizeUsername(raw)
      return {
        mutation: "whitelist.remove",
        username,
        title: `Remove @${username} from the whitelist?`,
        description:
          "They will start going through the normal rule pipeline again.",
        confirmLabel: "Remove",
        danger: false,
      }
    },
  },
]

export interface ParsedCommand {
  command: SlashCommand
  args: string
  raw: string
}

/** Parse a raw input string into a command + args, or null if not a command. */
export function parseCommand(input: string): ParsedCommand | null {
  const trimmed = input.trim()
  if (!trimmed.startsWith("/")) return null

  const spaceIdx = trimmed.indexOf(" ")
  const cmdName = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
  const args = spaceIdx === -1 ? "" : trimmed.slice(spaceIdx + 1).trim()

  const found = CHAT_COMMANDS.find((c) => c.command === cmdName)
  if (!found) return null

  return { command: found, args, raw: trimmed }
}

/**
 * Filter commands for the palette based on partial user input.
 * Matches against command name and label, case-insensitive.
 */
export function filterCommands(query: string): SlashCommand[] {
  if (!query.startsWith("/")) return []
  const q = query.slice(1).toLowerCase()

  if (query.indexOf(" ") !== -1) return []

  if (q === "") return [...CHAT_COMMANDS]
  return CHAT_COMMANDS.filter(
    (c) =>
      c.command.slice(1).toLowerCase().startsWith(q) ||
      c.label.toLowerCase().includes(q)
  )
}

/**
 * True while the user is still typing the command token (before any space).
 * After a space we treat input as argument entry and hide the palette.
 */
export function isSlashCommandDiscovery(input: string): boolean {
  if (!input.startsWith("/")) return false
  if (input.includes(" ")) return false
  return filterCommands(input).length > 0
}
