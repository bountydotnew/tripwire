import { useMemo, type ReactNode } from "react"
import {
  UnicodeSpinner,
  useRandomThinkingVariant,
} from "@tripwire/ui/unicode-spinner"
import { useThinkingPhrase } from "@tripwire/ai/components"
import type { UIMessage, MessagePart, ToolResultPart } from "#/types/chat"
import { MarkdownText } from "#/components/layout/app/chat/markdown-text"
import { useAIChat } from "#/providers/chat-context"
import type { ActionResultData } from "#/types/chat"
import {
  getPartKey,
  getTextContent,
  parseErrorMessage,
  parseActionResult,
  isToolPart,
  getPartToolName,
  getToolCallId,
  getToolInput,
  getToolOutput,
} from "#/lib/chat/format"
import { renderInlineText } from "#/components/layout/app/chat/chips"
import {
  BatchApprovalCard,
  CombinedActionResult,
  ReasoningBlock,
  ToolApprovalCard,
  ToolResultDisplay,
  ToolStep,
  coerceToolOutput,
  isRenderSpecPayload,
} from "#/components/layout/app/chat/chat-tool-cards"
import { TripwireLogo } from "@tripwire/ui/icons/tripwire-logo"
import {
  QuotaCreditsLockIcon20,
  ChatErrorAlertIcon14,
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
        <QuotaCreditsLockIcon20 className="text-[#9F9FA9]" />
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

  // Context-switch markers are synthetic single-part messages we
  // inject when the user changes the chat's repo. They render as a
  // labelled divider so the thread visually marks "everything below
  // this is about repo X now".
  const contextSwitch = messageParts.find(
    (
      part
    ): part is Extract<MessagePart, { type: "context-switch" }> =>
      (part as { type?: string }).type === "context-switch"
  )
  if (contextSwitch) {
    return <ContextSwitchDivider repoName={contextSwitch.repoName} />
  }
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

function ContextSwitchDivider({ repoName }: { repoName: string }) {
  return (
    <div className="flex items-center gap-2 py-1.5 select-none">
      <div className="h-px flex-1 bg-tw-border" />
      <span className="text-[11px] text-tw-text-muted">
        Switched to{" "}
        <span className="font-mono text-tw-text-secondary">{repoName}</span>
      </span>
      <div className="h-px flex-1 bg-tw-border" />
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
