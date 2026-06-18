import { useMemo } from "react"
import {
  renderBlockedComment,
  renderWarnedComment,
  type RenderCommentInput,
  type RenderOutcome,
} from "@tripwire/core/pr-comment"
import type { OrgPrCommentPreferences } from "@tripwire/db"

const FIXTURE = {
  username: "octocat",
  repoFullName: "acme/api",
  blockedReason: "Account is 3 days old (minimum: 30 days).",
  warnedReason: "PR changes 84 files (limit: 50).",
  ruleName: "accountAge",
  appBaseUrl: "https://tripwire.app",
} as const

type PreviewKind = "blocked" | "warned"

interface PrCommentPreviewProps {
  kind: PreviewKind
  prefs: OrgPrCommentPreferences
  /** Anchor used by ViewPill anchors to scroll/highlight this card. */
  id?: string
}

export function PrCommentPreview({ kind, prefs, id }: PrCommentPreviewProps) {
  const markdown = useMemo(() => {
    const outcome: RenderOutcome = kind === "blocked" ? "blocked" : "warned"
    const input: RenderCommentInput = {
      prefs,
      blockReason:
        kind === "blocked" ? FIXTURE.blockedReason : FIXTURE.warnedReason,
      ruleName: FIXTURE.ruleName,
      repoFullName: FIXTURE.repoFullName,
      username: FIXTURE.username,
      outcome,
      kind: "pull_request",
      appBaseUrl: FIXTURE.appBaseUrl,
    }
    return kind === "blocked"
      ? renderBlockedComment(input)
      : renderWarnedComment(input)
  }, [kind, prefs])

  const bot = (prefs.botDisplayName || "Tripwire").trim() || "Tripwire"
  const initial = bot.charAt(0).toUpperCase()

  return (
    <div
      id={id}
      className="overflow-hidden rounded-xl bg-tw-card transition-shadow"
    >
      <div className="border-b border-tw-border px-4 py-2.5 text-[12px] font-medium tracking-[-0.003em] text-tw-text-muted">
        {kind === "blocked" ? "Blocked" : "Warned"}
      </div>
      <div className="bg-tw-bg px-4 pt-3.5 pb-4">
        <div className="mb-3 flex items-center gap-2 border-b border-[#21262d] pb-3">
          <div className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-tw-hover-light text-[11px] font-semibold tracking-[-0.02em] text-tw-text-primary">
            {initial}
          </div>
          <span className="text-[13px] font-semibold text-[#c9d1d9]">
            tripwire-bot
          </span>
          <span className="inline-flex h-[17px] items-center rounded-[3px] border border-[#21262d] px-1.5 text-[10px] font-medium tracking-wider text-[#8b949e]">
            bot
          </span>
          <span className="text-[12px] text-[#8b949e]">commented just now</span>
        </div>
        <GhBody source={markdown} />
      </div>
    </div>
  )
}

interface GhBodyProps {
  source: string
}

/**
 * Tiny GitHub-styled renderer for the subset of markdown Tripwire emits:
 * blockquote (`>`), bold (`**`), italic (`_`), links (`[t](u)`).
 *
 * Not a general-purpose markdown renderer. We intentionally don't reuse
 * packages/ui's mini-markdown because that's styled for the tw assistant
 * surface, not a GH PR comment.
 */
function GhBody({ source }: GhBodyProps) {
  const html = useMemo(() => markdownToHTML(source), [source])
  return (
    <div
      className="text-[14px] leading-[1.55] tracking-[-0.003em] text-[#c9d1d9] [&_a]:text-[#58a6ff] [&_a:hover]:underline [&_strong]:text-[#c9d1d9] [&_strong]:font-semibold [&_em]:italic [&_em]:opacity-85 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#30363d] [&_blockquote]:pl-3.5 [&_blockquote]:py-[2px] [&_blockquote]:text-[#8b949e] [&_blockquote_p]:mb-2 [&_blockquote_p:last-child]:mb-0"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: input is a pure-function render of fixed prefs + escaped fixtures; no user-controlled HTML.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

function escapeHTML(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    if (c === "&") return "&amp;"
    if (c === "<") return "&lt;"
    if (c === ">") return "&gt;"
    if (c === '"') return "&quot;"
    return "&#39;"
  })
}

function formatInline(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    )
}

function markdownToHTML(md: string): string {
  const lines = md.split("\n")
  const out: string[] = []
  let bq: string[] = []
  const flush = () => {
    if (!bq.length) return
    const inner = bq
      .map((l) => (l === "" ? '<p class="empty">&nbsp;</p>' : `<p>${l}</p>`))
      .join("")
    out.push(`<blockquote>${inner}</blockquote>`)
    bq = []
  }
  for (const line of lines) {
    if (line.startsWith("> ") || line === ">") {
      const inner = line === ">" ? "" : line.slice(2)
      bq.push(formatInline(escapeHTML(inner)))
    } else {
      flush()
      if (line.trim()) out.push(`<p>${formatInline(escapeHTML(line))}</p>`)
    }
  }
  flush()
  return out.join("")
}
