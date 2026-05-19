export type ListedUserStatus = "blacklisted" | "whitelisted"

export interface ListedUserMention {
  username: string
  avatarUrl?: string | null
  status: ListedUserStatus
}

export interface MentionTrigger {
  query: string
  start: number
  end: number
}

const MAX_SUGGESTIONS = 6

export function getMentionTrigger(
  value: string,
  cursorPosition: number
): MentionTrigger | null {
  const beforeCursor = value.slice(0, cursorPosition)
  const match = beforeCursor.match(/(^|\s)@([A-Za-z0-9_-]*)$/)
  if (!match) return null

  const query = match[2] ?? ""
  const start = cursorPosition - query.length - 1

  return {
    query,
    start,
    end: cursorPosition,
  }
}

export function replaceMentionTrigger(
  value: string,
  trigger: MentionTrigger
): string {
  const before = value.slice(0, trigger.start).trimEnd()
  const after = value.slice(trigger.end).trimStart()

  return [before, after].filter(Boolean).join(" ")
}

export function buildListedUserSuggestions(
  blacklist: ListedUserMention[],
  whitelist: ListedUserMention[],
  query: string,
  selectedUsernames: string[]
): ListedUserMention[] {
  const selected = new Set(
    selectedUsernames.map((username) => username.toLowerCase())
  )
  const seen = new Set<string>()
  const normalizedQuery = query.trim().replace(/^@/, "").toLowerCase()
  const users = [...blacklist, ...whitelist]
  const suggestions: ListedUserMention[] = []

  for (const user of users) {
    const usernameKey = user.username.toLowerCase()
    if (seen.has(usernameKey) || selected.has(usernameKey)) continue
    if (normalizedQuery && !usernameKey.startsWith(normalizedQuery)) continue

    seen.add(usernameKey)
    suggestions.push(user)
  }

  return suggestions.slice(0, MAX_SUGGESTIONS)
}

export function composeMentionMessage(
  mentions: ListedUserMention[],
  text: string
): string {
  return [...mentions.map((mention) => `@${mention.username}`), text.trim()]
    .filter(Boolean)
    .join(" ")
}
