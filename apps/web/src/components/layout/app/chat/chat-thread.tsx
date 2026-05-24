import { useMemo, useState, type ReactNode } from "react"
import { Button } from "@tripwire/ui/button"
import {
  UnicodeSpinner,
  useRandomThinkingVariant,
} from "@tripwire/ui/unicode-spinner"
import { useThinkingPhrase } from "@tripwire/ai/components"
import type {
  UIMessage,
  MessagePart,
  ToolResultPart,
  RenderSpec,
} from "#/types/chat"
import { JSONUIProvider, Renderer } from "@json-render/react"
import { Streamdown, type StreamdownProps } from "streamdown"
import { code } from "@streamdown/code"
import { useAIChat } from "#/providers/chat-context"
import { registry } from "@tripwire/ui"
import type { ActionResultData } from "#/types/chat"
import {
  getPartKey,
  getTextContent,
  formatToolName,
  formatToolArgs,
  parseErrorMessage,
  parseActionResult,
  getApprovalText,
  getBatchApprovalText,
  isToolPart,
  getPartToolName,
  getToolCallId,
  getToolInput,
  getToolOutput,
} from "#/lib/chat/format"
import { getBriefActionText, renderInlineText } from "#/components/layout/app/chat/chips"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import {
  QuotaCreditsLockIcon20,
  ChatErrorAlertIcon14,
  ToolStepErrorRingIcon12,
  ToolStepSuccessRingIcon12,
  ThoughtCollapsibleChevronIcon10,
  BatchResultSuccessRingIcon14,
  BatchResultErrorRingIcon14,
} from "@tripwire/ui/icons/chat-thread-status-icons"

interface ChatThreadProps {
  messages?: UIMessage[]
  isLoading?: boolean
  error?: Error | null
  isQuotaExhausted?: boolean
  respondToToolApproval?: (approvalId: string, approved: boolean) => void
  footer?: ReactNode
}

export function ChatThread(props: ChatThreadProps = {}) {
  const ctx = useAIChat()
  const messages = props.messages ?? ctx.messages
  const isLoading = props.isLoading ?? ctx.isLoading
  const error = props.error ?? ctx.error
  const isQuotaExhausted = props.isQuotaExhausted ?? ctx.isQuotaExhausted
  const respondToToolApproval =
    props.respondToToolApproval ?? ctx.respondToToolApproval
  const footer = props.footer

  const avatarMap = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role !== "assistant") continue
      const next = messages[i + 1]
      const isLastInRun = !next || next.role !== "assistant"
      out[m.id] = isLastInRun
    }
    return out
  }, [messages])

  if (isQuotaExhausted) {
    return <QuotaExhaustedState />
  }

  if (messages.length === 0 && !error) {
    if (footer) {
      return (
        <div className="flex flex-col gap-3 pt-1 pb-2">
          <ChatEmptyState />
          {footer}
        </div>
      )
    }
    return <ChatEmptyState />
  }

  if (messages.length === 0 && error) {
    return (
      <div className="flex flex-col gap-3 pt-1 pb-2">
        <ErrorMessage message={error.message} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3 pt-1 pb-2">
      {messages.map((msg, msgIdx) => (
        <div
          key={`${msg.id || "msg"}-${msgIdx}`}
          className="transition-all duration-300 ease-out"
        >
          <ChatMessage
            message={msg}
            showAvatar={avatarMap[msg.id] !== false}
            onRespondToApproval={respondToToolApproval}
          />
        </div>
      ))}
      {footer}
      {isLoading && <LoadingIndicator />}
      {error && <ErrorMessage message={error.message} />}
    </div>
  )
}

function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex size-12 items-center justify-center">
        <TripwireLogo size={20} fill="#B4B4B4" />
      </div>
      <p className="mb-1 text-[14px] text-tw-text-secondary">Ask me anything</p>
      <p className="max-w-[240px] text-[12px] text-tw-text-muted">
        I can help you investigate contributors, manage your blacklist, and
        understand activity patterns.
      </p>
    </div>
  )
}

function QuotaExhaustedState() {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[#FAFAFA08]">
        <QuotaCreditsLockIcon20 />
      </div>
      <p className="mb-1 text-[14px] text-tw-text-secondary">Out of credits</p>
      <p className="max-w-[220px] text-[12px] text-tw-text-muted">
        You've used all your AI credits for this month.
      </p>
    </div>
  )
}

function ErrorMessage({ message }: { message: string }) {
  const { title, detail } = parseErrorMessage(message)

  return (
    <div className="flex items-end gap-2 px-1">
      <div className="w-6 shrink-0">
        <div className="flex size-6 items-center justify-center rounded-full bg-[#F56D5D1A]">
          <TripwireLogo size={12} fill="#B4B4B4" />
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="rounded-xl border border-tw-error/10 bg-[#F56D5D0D] p-3">
          <div className="flex items-start gap-2">
            <div className="mt-0.5 shrink-0">
              <ChatErrorAlertIcon14 className="text-tw-error" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] leading-tight font-medium text-tw-error">
                {title}
              </div>
              {detail && (
                <div className="mt-1 text-[12px] leading-relaxed text-tw-text-secondary">
                  {detail}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LoadingIndicator() {
  const variant = useRandomThinkingVariant()
  const phrase = useThinkingPhrase()

  return (
    <div className="flex items-end gap-2 px-1">
      <div className="w-6 shrink-0">
        <div className="flex size-6 items-center justify-center rounded-full bg-[#FAFAFA14]">
          <TripwireLogo size={12} fill="#B4B4B4" />
        </div>
      </div>
      <div className="flex items-center gap-1.5 text-[12px] text-tw-text-muted">
        <UnicodeSpinner
          variant={variant}
          className="text-[13px] opacity-80"
          label={phrase}
        />
        <span>{phrase}...</span>
      </div>
    </div>
  )
}

interface ChatMessageProps {
  message: UIMessage
  showAvatar: boolean
  onRespondToApproval: (approvalId: string, approved: boolean) => void
}

// Track approval IDs that have already been responded to.
// Module-level so it survives component remounts.
const handledApprovalIds = new Set<string>()

function ChatMessage({
  message,
  showAvatar,
  onRespondToApproval,
}: ChatMessageProps) {
  if (message.role === "user") {
    return <UserMessage content={getTextContent(message)} />
  }

  const messageParts = (message.parts ?? []) as MessagePart[]
  const pendingApprovals = messageParts.filter(
    (
      part
    ): part is MessagePart & {
      approval: { id: string }
      state: "approval-requested"
    } =>
      isToolPart(part) &&
      part.state === "approval-requested" &&
      !!part.approval &&
      !handledApprovalIds.has(part.approval.id)
  )

  const handleApproveAll = () => {
    for (const part of pendingApprovals) {
      if (handledApprovalIds.has(part.approval.id)) continue
      handledApprovalIds.add(part.approval.id)
      onRespondToApproval(part.approval.id, true)
    }
  }

  const handleDenyAll = () => {
    for (const part of pendingApprovals) {
      if (handledApprovalIds.has(part.approval.id)) continue
      handledApprovalIds.add(part.approval.id)
      onRespondToApproval(part.approval.id, false)
    }
  }

  const groupedParts = useMemo(() => {
    const rawParts = (message.parts ?? []) as MessagePart[]

    // Deduplicate parts by toolCallId (legacy tool streams can send duplicates)
    const seen = new Set<string>()
    const parts = rawParts.filter((part) => {
      if (isToolPart(part) || part.type === "tool-result") {
        const id =
          part.type === "tool-result"
            ? (part as ToolResultPart).toolCallId
            : getToolCallId(part)
        const key = `${part.type}-${id}`
        if (id && seen.has(key)) return false
        if (id) seen.add(key)
      }
      return true
    })

    const result: Array<
      | MessagePart
      | { type: "grouped-results"; results: ActionResultData[]; key: string }
    > = []
    let currentGroup: Array<{ part: MessagePart; data: ActionResultData }> = []
    let currentAction: string | null = null

    const flushGroup = () => {
      if (currentGroup.length > 1) {
        result.push({
          type: "grouped-results",
          results: currentGroup.map((g) => g.data),
          key: `group-${result.length}`,
        })
      } else if (currentGroup.length === 1) {
        result.push(currentGroup[0].part)
      }
      currentGroup = []
      currentAction = null
    }

    for (const part of parts) {
      if (part.type === "tool-result") {
        const actionResult = parseActionResult(
          (part as ToolResultPart).content ?? ""
        )
        if (actionResult && actionResult.success) {
          if (currentAction === null || currentAction === actionResult.action) {
            currentGroup.push({ part, data: actionResult })
            currentAction = actionResult.action
            continue
          } else {
            flushGroup()
            currentGroup.push({ part, data: actionResult })
            currentAction = actionResult.action
            continue
          }
        }
      }
      if (isToolPart(part) && part.state === "output-available") {
        const output = getToolOutput(part)
        const actionResult = parseActionResult(
          typeof output === "string" ? output : JSON.stringify(output)
        )
        if (actionResult && actionResult.success) {
          if (currentAction === null || currentAction === actionResult.action) {
            currentGroup.push({ part, data: actionResult })
            currentAction = actionResult.action
            continue
          } else {
            flushGroup()
            currentGroup.push({ part, data: actionResult })
            currentAction = actionResult.action
            continue
          }
        }
      }
      flushGroup()
      result.push(part)
    }
    flushGroup()
    return result
  }, [message.parts])

  return (
    <div className="flex items-end gap-2 px-1">
      <div className="w-6 shrink-0">
        {showAvatar && (
          <div className="flex size-6 items-center justify-center rounded-full bg-[#FAFAFA14]">
            <TripwireLogo size={12} fill="#B4B4B4" />
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {pendingApprovals.length > 1 ? (
          <>
            {groupedParts
              .filter(
                (p) =>
                  !isToolPart(p as MessagePart) ||
                  (p as MessagePart & { state?: string }).state !==
                    "approval-requested"
              )
              .map((part, i) => {
                if (part.type === "grouped-results") {
                  return (
                    <CombinedActionResult
                      key={part.key}
                      results={part.results}
                    />
                  )
                }
                const mp = part as MessagePart
                return (
                  <MessagePartRenderer
                    key={getPartKey(mp, message.id, i)}
                    part={mp}
                    onRespondToApproval={onRespondToApproval}
                  />
                )
              })}
            <BatchApprovalCard
              approvals={pendingApprovals}
              onApproveAll={handleApproveAll}
              onDenyAll={handleDenyAll}
            />
          </>
        ) : (
          groupedParts.map((part, i) => {
            if (part.type === "grouped-results") {
              return (
                <CombinedActionResult key={part.key} results={part.results} />
              )
            }
            const mp = part as MessagePart
            return (
              <MessagePartRenderer
                key={getPartKey(mp, message.id, i)}
                part={mp}
                onRespondToApproval={onRespondToApproval}
              />
            )
          })
        )}
      </div>
    </div>
  )
}

function UserMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-end px-1">
      <div className="max-w-[86%] rounded-2xl rounded-tr-sm bg-[#252528] px-3 py-2 text-[13px] leading-[19px] whitespace-pre-wrap text-tw-text-primary">
        {renderInlineText(content)}
      </div>
    </div>
  )
}

interface MessagePartRendererProps {
  part: MessagePart
  onRespondToApproval: (approvalId: string, approved: boolean) => void
}

function MessagePartRenderer({
  part,
  onRespondToApproval,
}: MessagePartRendererProps) {
  switch (part.type) {
    case "text":
      return (
        <MarkdownText
          content={part.text ?? (part as { content?: string }).content ?? ""}
        />
      )

    case "thinking":
    case "reasoning":
      return (
        <ReasoningBlock
          content={
            (part as { content?: string; text?: string }).content ??
            (part as { text?: string }).text ??
            ""
          }
        />
      )

    case "tool-result":
      // Tool results are now shown inside ToolStep's collapsible detail
      // Only render standalone if there's a UI card (json-render spec)
      try {
        const parsed = JSON.parse((part as ToolResultPart).content ?? "")
        if (
          parsed &&
          typeof parsed === "object" &&
          "root" in parsed &&
          "elements" in parsed
        ) {
          return <ToolResultDisplay result={parsed} />
        }
        return null // Absorbed into ToolStep
      } catch {
        return null
      }

    default:
      if (isToolPart(part)) {
        const toolArgs = getToolInput(part)
        const toolName = getPartToolName(part)
        const approval = "approval" in part ? part.approval : undefined

        if (
          part.state === "approval-requested" &&
          approval &&
          !handledApprovalIds.has(approval.id)
        ) {
          return (
            <ToolApprovalCard
              toolName={toolName}
              args={toolArgs}
              onApprove={() => {
                handledApprovalIds.add(approval.id)
                onRespondToApproval(approval.id, true)
              }}
              onDeny={() => {
                handledApprovalIds.add(approval.id)
                onRespondToApproval(approval.id, false)
              }}
            />
          )
        }

        if (part.state === "output-available") {
          const output = getToolOutput(part)
          const resolved = coerceToolOutput(output)
          const hideToolChrome = isRenderSpecPayload(resolved)

          return (
            <ToolResultDisplay
              result={output}
              fallback={
                hideToolChrome ? null : (
                  <ToolStep
                    toolName={toolName}
                    args={toolArgs}
                    state={part.state}
                  />
                )
              }
            />
          )
        }

        return (
          <ToolStep
            toolName={toolName}
            args={toolArgs}
            state={part.state ?? "input-streaming"}
          />
        )
      }
      return null
  }
}

// Security: restrict which URLs AI-generated markdown can render as links/images.
// Without these allowlists, AI or GitHub-derived content could inject:
//   - clickable links to attacker-controlled domains
//   - auto-loaded <img> tags that leak the viewer's IP/UA to arbitrary hosts
// Keep the lists minimal; better to block too much and add later.
const ALLOWED_LINK_PREFIXES: readonly string[] = [
  "https://github.com/",
  "https://api.github.com/",
  "https://gist.github.com/",
  "https://docs.github.com/",
  "https://avatars.githubusercontent.com/",
  "https://user-images.githubusercontent.com/",
]

const ALLOWED_IMAGE_PREFIXES: readonly string[] = [
  "https://avatars.githubusercontent.com/",
  "https://user-images.githubusercontent.com/",
  "https://github.com/",
]

function isAllowed(
  url: string | undefined,
  allowlist: readonly string[]
): boolean {
  if (!url) return false
  return allowlist.some((prefix) => url.startsWith(prefix))
}

// `urlTransform` is called by Streamdown for every href/src; returning the URL
// unchanged keeps it, returning an empty/non-matching string drops it.
// We use it as a first-line filter; the `a`/`img` component overrides below
// are a defensive second layer.
const safeUrlTransform = (url: string, key: string): string => {
  if (key === "src") {
    return isAllowed(url, ALLOWED_IMAGE_PREFIXES) ? url : ""
  }
  if (key === "href") {
    return isAllowed(url, ALLOWED_LINK_PREFIXES) ? url : ""
  }
  return url
}

// Streamdown lacks a built-in image/link allowlist prop. We layer a custom
// `urlTransform` (filters URLs) with `components` overrides for `a` and `img`
// (renders the disallowed URL as inert text instead of a clickable/loaded element).
const SAFE_STREAMDOWN_CONFIG = {
  linkSafety: { enabled: true },
  urlTransform: safeUrlTransform,
  components: {
    a: ({ href, children, ...rest }) => {
      if (!isAllowed(href, ALLOWED_LINK_PREFIXES)) {
        // Render as plain text: no anchor, no navigation.
        return <span className="tw-chat-blocked-link">{children}</span>
      }
      return (
        <a {...rest} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      )
    },
    img: ({ src, alt }) => {
      if (typeof src !== "string" || !isAllowed(src, ALLOWED_IMAGE_PREFIXES)) {
        // Drop the image entirely; never issue a GET to a non-allowlisted host.
        return null
      }
      return (
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      )
    },
  },
} satisfies Pick<StreamdownProps, "linkSafety" | "urlTransform" | "components">

function MarkdownText({ content }: { content: string }) {
  return (
    <Streamdown
      className="tw-chat-markdown"
      mode="static"
      plugins={{ code }}
      controls={false}
      {...SAFE_STREAMDOWN_CONFIG}
    >
      {content}
    </Streamdown>
  )
}

interface ToolStepProps {
  toolName: string
  args: Record<string, unknown>
  state: string
}

/** Tool finished with json-render output — skip collapsible ToolStep chrome. */
function coerceToolOutput(output: unknown): unknown {
  if (typeof output === "string") {
    try {
      return JSON.parse(output) as unknown
    } catch {
      return output
    }
  }
  return output
}

function isRenderSpecPayload(value: unknown): boolean {
  if (!value || typeof value !== "object") return false
  const r = value as Record<string, unknown>
  return (
    typeof r.root === "string" &&
    r.elements !== undefined &&
    typeof r.elements === "object" &&
    r.elements !== null
  )
}

function ToolStep({ toolName, args, state }: ToolStepProps) {
  const [isOpen, setIsOpen] = useState(false)
  const isComplete =
    state === "input-complete" ||
    state === "approval-responded" ||
    state === "output-available" ||
    state === "output-denied"
  const isError = state === "error" || state === "output-error"
  const displayName = formatToolName(toolName)
  const argsStr = formatToolArgs(toolName, args)
  const hasArgs = Object.keys(args).length > 0

  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        type="button"
        onClick={() => hasArgs && setIsOpen(!isOpen)}
        className={`flex w-full items-center justify-start gap-2 py-0.5 text-[12px] text-tw-text-muted ${hasArgs ? "cursor-pointer hover:text-[#E0E0E0]" : "cursor-default"} transition-colors`}
      >
        {isError ? (
          <ToolStepErrorRingIcon12 className="shrink-0 text-red-400/60" />
        ) : isComplete ? (
          <ToolStepSuccessRingIcon12 className="shrink-0 text-tw-success/60" />
        ) : (
          <UnicodeSpinner
            variant="dots"
            className="text-[12px] text-tw-text-secondary"
            label={displayName}
          />
        )}
        <span className={isComplete ? "" : "text-tw-text-secondary"}>
          {displayName}
        </span>
        {!isOpen && argsStr && (
          <span className="max-w-[140px] truncate text-tw-text-tertiary">
            {argsStr}
          </span>
        )}
      </Button>
      {isOpen && hasArgs && (
        <div className="mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 text-[11px]">
          {Object.entries(args).map(([key, val]) => (
            <div key={key} className="flex gap-2">
              <span className="shrink-0 text-tw-text-muted">{key}</span>
              <span className="truncate font-mono text-tw-text-secondary">
                {typeof val === "string" ? val : JSON.stringify(val)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ReasoningBlock({ content }: { content: string }) {
  const [isOpen, setIsOpen] = useState(false)

  if (!content.trim()) return null

  return (
    <div className="flex flex-col">
      <Button
        variant="ghost"
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-start gap-1.5 py-0.5 text-[12px] text-tw-text-muted transition-colors hover:text-tw-text-secondary"
      >
        <ThoughtCollapsibleChevronIcon10
          className={`shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
        <span className="text-[13px] text-tw-text-secondary">Thinking</span>
      </Button>
      {isOpen && (
        <div className="border-l border-[#27272A] pl-4 text-[12px] leading-[18px] text-tw-text-muted/70">
          <Streamdown
            className="tw-chat-markdown"
            mode="static"
            plugins={{ code }}
            controls={false}
            {...SAFE_STREAMDOWN_CONFIG}
          >
            {content}
          </Streamdown>
        </div>
      )}
    </div>
  )
}

interface ToolApprovalCardProps {
  toolName: string
  args: Record<string, unknown>
  onApprove: () => void
  onDeny: () => void
}

function ToolApprovalCard({
  toolName,
  args,
  onApprove,
  onDeny,
}: ToolApprovalCardProps) {
  const username = args.username as string | undefined
  const { text, yesLabel, noLabel } = getApprovalText(toolName, username)

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-tw-card p-3">
      <div className="text-[13px] text-tw-text-primary">
        {renderInlineText(text)}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={onApprove}
          className="h-7 rounded-lg bg-tw-text-primary px-3 text-[12px] font-medium text-[#0D0D0F] transition-opacity hover:opacity-90"
        >
          {yesLabel}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={onDeny}
          className="h-7 rounded-lg bg-tw-hover px-3 text-[12px] font-medium text-tw-text-secondary transition-colors hover:text-tw-text-primary"
        >
          {noLabel}
        </Button>
      </div>
    </div>
  )
}

interface BatchApprovalCardProps {
  approvals: Array<MessagePart & { approval: { id: string } }>
  onApproveAll: () => void
  onDenyAll: () => void
}

function BatchApprovalCard({
  approvals,
  onApproveAll,
  onDenyAll,
}: BatchApprovalCardProps) {
  const parsed = approvals.map((part) => {
    const toolArgs = getToolInput(part)
    return {
      name: getPartToolName(part),
      username: toolArgs.username as string | undefined,
    }
  })

  const allSameAction = parsed.every((p) => p.name === parsed[0].name)
  const usernames = parsed.map((p) => p.username).filter(Boolean) as string[]

  if (allSameAction && usernames.length > 1) {
    const action = parsed[0].name
    const lastUser = usernames[usernames.length - 1]
    const userList =
      usernames
        .slice(0, -1)
        .map((u) => `@${u}`)
        .join(", ") + ` and @${lastUser}`
    const { prefix, suffix, consequence, buttonLabel } =
      getBatchApprovalText(action)

    return (
      <div className="flex flex-col gap-2 rounded-xl bg-tw-card p-3">
        <div className="text-[13px] text-tw-text-primary">
          {prefix} {renderInlineText(userList)}
          {suffix ? ` ${suffix}` : ""}?
        </div>
        {consequence && (
          <div className="text-[12px] text-tw-text-muted">{consequence}</div>
        )}
        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="ghost"
            type="button"
            onClick={onApproveAll}
            className="h-7 rounded-lg bg-tw-text-primary px-3 text-[12px] font-medium text-[#0D0D0F] transition-opacity hover:opacity-90"
          >
            Yes, {buttonLabel}
          </Button>
          <Button
            variant="ghost"
            type="button"
            onClick={onDenyAll}
            className="h-7 rounded-lg bg-tw-hover px-3 text-[12px] font-medium text-tw-text-secondary transition-colors hover:text-tw-text-primary"
          >
            Cancel
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl bg-tw-card p-3">
      <div className="text-[12px] tracking-wider text-tw-text-muted uppercase">
        {approvals.length} actions
      </div>
      <div className="flex flex-col gap-1">
        {parsed.map((p, i) => (
          <div
            key={getToolCallId(approvals[i]) ?? approvals[i].approval.id}
            className="flex items-center gap-2 text-[13px] text-tw-text-primary"
          >
            <span className="size-1.5 shrink-0 rounded-full bg-tw-warning" />
            {getBriefActionText(p.name, p.username)}
          </div>
        ))}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={onApproveAll}
          className="h-7 rounded-lg bg-tw-text-primary px-3 text-[12px] font-medium text-[#0D0D0F] transition-opacity hover:opacity-90"
        >
          Approve all
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={onDenyAll}
          className="h-7 rounded-lg bg-tw-hover px-3 text-[12px] font-medium text-tw-text-secondary transition-colors hover:text-tw-text-primary"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}

function ToolResultDisplay({
  result,
  fallback = null,
}: {
  result: unknown
  fallback?: ReactNode
}) {
  if (typeof result === "string") {
    try {
      result = JSON.parse(result)
    } catch {
      return fallback
    }
  }
  if (!result || typeof result !== "object") return fallback

  const r = result as Record<string, unknown>

  if ("root" in r && "elements" in r && typeof r.root === "string") {
    return (
      <JSONUIProvider registry={registry}>
        <Renderer spec={r as unknown as RenderSpec} registry={registry} />
      </JSONUIProvider>
    )
  }

  return fallback
}

function CombinedActionResult({ results }: { results: ActionResultData[] }) {
  if (results.length === 0) return null

  const allSuccess = results.every((r) => r.success)
  const usernames = results.map((r) => r.username).filter(Boolean) as string[]

  let message: string
  if (usernames.length <= 1) {
    message = results[0].message
  } else {
    const firstMsg = results[0].message
    const match = firstMsg.match(/^@\w+\s+has\s+been\s+(.+)$/)

    if (match) {
      const lastUser = usernames.pop()!
      const userList = "@" + usernames.join(", @") + ` and @${lastUser}`
      message = `${userList} have been ${match[1]}`
    } else {
      const lastUser = usernames.pop()!
      const userList = "@" + usernames.join(", @") + ` and @${lastUser}`
      message = `${userList}: ${results[0].message.replace(/@\w+\s*/, "")}`
    }
  }

  const bgColor = allSuccess
    ? "bg-[#4ADE801A] border-tw-success/20"
    : "bg-[#F56D5D1A] border-tw-error/20"
  const iconColor = allSuccess ? "text-tw-success" : "text-tw-error"

  return (
    <div className={`flex items-center gap-2 rounded-xl border p-3 ${bgColor}`}>
      {allSuccess ? (
        <BatchResultSuccessRingIcon14 className={iconColor} />
      ) : (
        <BatchResultErrorRingIcon14 className={iconColor} />
      )}
      <span className="text-[13px] text-tw-text-primary">
        {renderInlineText(message)}
      </span>
    </div>
  )
}
