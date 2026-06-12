// GitHub App accounts (`name[bot]`) and conventional bot suffixes
// (`name-bot`, `name_bot`). Won't false-positive on `abbot`, `robotic`.
const BOT_SUFFIX = /(?:\[bot\]|[-_]bot)$/

export function isBotOrGhost(username: string | null | undefined): boolean {
  if (!username) return true
  const lower = username.toLowerCase()
  if (lower === "ghost") return true
  return BOT_SUFFIX.test(lower)
}

// Whether a webhook sender is a coding bot (Tembo, CodeRabbit, Dependabot,
// GitHub Actions, etc.). Prefers GitHub's authoritative `type` field and
// falls back to the conventional bot login suffixes.
export function isBotSender(
  login: string | null | undefined,
  type?: string | null
): boolean {
  if (type === "Bot") return true
  if (!login) return false
  return BOT_SUFFIX.test(login.toLowerCase())
}
