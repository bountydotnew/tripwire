import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react"
import { Button } from "@tripwire/ui/button"
import { useQuery } from "@tanstack/react-query"
import { MicIcon, PlusIcon } from "@tripwire/ui/icons/nav-icons"
import { useTRPC } from "#/integrations/trpc/react"
import { cn } from "@tripwire/ui/utils"
import { useWorkspace } from "#/providers/workspace-context"
import { parseCommand, type SlashCommand } from "#/lib/chat/commands"
import {
  buildListedUserSuggestions,
  getMentionTrigger,
  listGithubAtMentionsMissingChips,
  MAX_LISTED_USER_SUGGESTIONS,
  replaceMentionTrigger,
  type ListedUserSuggestion,
} from "#/lib/chat/mentions"
import { isValidGithubLogin } from "#/lib/github/login-validation"
import { useMentionChipAttachmentBelow } from "#/hooks/use-mention-chip-attachment-below"
import { UserMentionChip } from "#/components/layout/app/chat/chips"
import { CommandArgHint } from "#/components/layout/app/chat/command-arg-hint"
import { CommandPalette } from "#/components/layout/app/chat/command-palette"
import { useSlashCommandInput } from "#/hooks/use-slash-command-input"
import { UnicodeSpinner } from "@tripwire/ui/unicode-spinner"

interface ChatComposerProps {
  className?: string
  contextActionAdornment?: ReactNode
  disabled?: boolean
  isLoading?: boolean
  placeholder?: string
  onSend: (message: string) => void
  /**
   * When set and the line parses as a slash command, `run` is called instead
   * of `onSend`. Return `done` to clear the composer; `error` keeps the text.
   */
  slashCommandRunner?: {
    run: (
      raw: string
    ) => Promise<{ status: "done" | "error"; message?: string }>
  }
}

function listClasses(list: ListedUserSuggestion["list"]) {
  switch (list) {
    case "blacklist":
      return "border-[#F56D5D26] bg-[#F56D5D14] text-[#F2A39A]"
    case "whitelist":
      return "border-[#67E19F26] bg-[#67E19F14] text-[#A7E9C3]"
    case "github":
      return "border-white/15 bg-white/10 text-tw-text-secondary"
  }
}

function listBadgeLabel(list: ListedUserSuggestion["list"]): string {
  return list === "github" ? "GitHub" : list
}

function MentionAvatar({
  user,
  size = "size-5",
}: {
  user: ListedUserSuggestion
  size?: string
}) {
  const src =
    user.avatarUrl ?? `https://github.com/${user.githubUsername}.png?size=40`
  return (
    <img
      src={src}
      alt=""
      className={`${size} shrink-0 rounded-full bg-tw-inner`}
      loading="lazy"
    />
  )
}

/** Compose outgoing message from inline text + chipped mentions (slash-aware). */
function buildComposedLine(
  text: string,
  mentions: ListedUserSuggestion[],
  slashCommandRunner: ChatComposerProps["slashCommandRunner"]
): string {
  const trimmed = text.trim()
  if (slashCommandRunner && text.trimStart().startsWith("/")) {
    const handlesInText = new Set(
      (trimmed.match(/@[A-Za-z0-9_-]+/g) ?? []).map((t) => t.toLowerCase())
    )
    const handles = mentions
      .filter((m) => !handlesInText.has(`@${m.githubUsername}`.toLowerCase()))
      .map((m) => `@${m.githubUsername}`)
      .join(" ")
    return [trimmed, handles].filter(Boolean).join(" ").trim()
  }

  const everyChipAlreadyInText =
    mentions.length > 0 &&
    mentions.every((m) => {
      const esc = m.githubUsername.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
      return new RegExp(`@${esc}(?:\\s|$)`, "i").test(trimmed)
    })

  if (everyChipAlreadyInText) {
    return trimmed
  }

  /** Message first, then chipped @handles — matches composer layout (text left, chips right). */
  return [trimmed, ...mentions.map((m) => `@${m.githubUsername}`)]
    .filter(Boolean)
    .join(" ")
    .trim()
}

/** Slash args: chip picked users instead of inserting `@name` into the input (avoids duplicate + split UX). */
function stripMentionTriggerOnly(
  value: string,
  trigger: NonNullable<ReturnType<typeof getMentionTrigger>>
): { value: string; cursorPosition: number } {
  const before = value.slice(0, trigger.start)
  const after = value.slice(trigger.end)
  const nextValue = `${before}${after}`.replace(/\s{2,}/g, " ")
  const cursorPosition = Math.min(trigger.start, nextValue.length)
  return { value: nextValue, cursorPosition }
}

export function ChatComposer({
  className,
  contextActionAdornment,
  disabled = false,
  isLoading = false,
  placeholder = "Ask anything...",
  onSend,
  slashCommandRunner,
}: ChatComposerProps) {
  const { repo } = useWorkspace()
  const trpc = useTRPC()
  const suggestionListId = `${useId()}-mention-suggestions`
  const inputRef = useRef<HTMLInputElement>(null)
  const [text, setText] = useState("")
  const [cursorPosition, setCursorPosition] = useState(0)
  const [mentions, setMentions] = useState<ListedUserSuggestion[]>([])
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const [dismissedTriggerKey, setDismissedTriggerKey] = useState<string | null>(
    null
  )

  const mentionsQuery = useQuery(
    trpc.whitelist.mentions.queryOptions(
      { repoId: repo?.id ?? "" },
      { enabled: !!repo?.id, staleTime: 60_000 }
    )
  )

  const trigger = getMentionTrigger(text, cursorPosition)
  const triggerKey = trigger
    ? `${trigger.start}:${trigger.end}:${trigger.query}`
    : null

  const activeMentionQuery = trigger?.query ?? ""
  const [debouncedMentionQuery, setDebouncedMentionQuery] = useState("")
  useEffect(() => {
    const id = window.setTimeout(() => {
      setDebouncedMentionQuery(activeMentionQuery)
    }, 300)
    return () => window.clearTimeout(id)
  }, [activeMentionQuery])

  const resolveGithubMentionQuery = useQuery(
    trpc.whitelist.resolveGithubMention.queryOptions(
      { repoId: repo?.id ?? "", login: debouncedMentionQuery },
      {
        enabled:
          Boolean(repo?.id) &&
          !disabled &&
          debouncedMentionQuery.length > 0 &&
          isValidGithubLogin(debouncedMentionQuery),
        staleTime: 60_000,
      }
    )
  )

  const listBasedSuggestions = useMemo(() => {
    if (!trigger || !mentionsQuery.data) return []

    const users: ListedUserSuggestion[] = [
      ...mentionsQuery.data.blacklisted.map((u) => ({
        ...u,
        list: "blacklist" as const,
      })),
      ...mentionsQuery.data.whitelisted.map((u) => ({
        ...u,
        list: "whitelist" as const,
      })),
    ]

    return buildListedUserSuggestions(users, trigger.query)
  }, [mentionsQuery.data, trigger])

  const authoritativeResolvedGithubUser = useMemo(() => {
    const data = resolveGithubMentionQuery.data
    if (!data || !trigger) return null
    if (debouncedMentionQuery !== trigger.query) return null
    if (data.login.toLowerCase() !== trigger.query.toLowerCase()) return null
    return data
  }, [debouncedMentionQuery, resolveGithubMentionQuery.data, trigger])

  const githubResolvedSuggestion = useMemo((): ListedUserSuggestion | null => {
    if (!authoritativeResolvedGithubUser) return null
    const loginKey = authoritativeResolvedGithubUser.login.toLowerCase()
    if (
      listBasedSuggestions.some(
        (u) => u.githubUsername.toLowerCase() === loginKey
      )
    ) {
      return null
    }

    return {
      githubUsername: authoritativeResolvedGithubUser.login,
      avatarUrl: authoritativeResolvedGithubUser.avatarUrl,
      list: "github",
    }
  }, [authoritativeResolvedGithubUser, listBasedSuggestions])

  const mentionSelectableRows = useMemo(() => {
    const merged =
      githubResolvedSuggestion !== null
        ? [githubResolvedSuggestion, ...listBasedSuggestions]
        : [...listBasedSuggestions]

    return merged.slice(0, MAX_LISTED_USER_SUGGESTIONS)
  }, [githubResolvedSuggestion, listBasedSuggestions])

  /** Outgoing chat line: merges chipped mentions without duplicating handles already in `text`. */
  const composedMessage = useMemo(
    () => buildComposedLine(text, mentions, slashCommandRunner),
    [mentions, slashCommandRunner, text]
  )

  const chippedGithubUsernamesLower = useMemo(
    () => new Set(mentions.map((m) => m.githubUsername.toLowerCase())),
    [mentions]
  )

  /** Raw `@handles` typed in input that are not chipped — block send until resolved. */
  const atMentionsMissingChips = useMemo(
    () => listGithubAtMentionsMissingChips(text, chippedGithubUsernamesLower),
    [chippedGithubUsernamesLower, text]
  )

  const showGithubResolveLoading =
    Boolean(repo?.id) &&
    !disabled &&
    trigger !== null &&
    debouncedMentionQuery === trigger.query &&
    trigger.query.length > 0 &&
    isValidGithubLogin(trigger.query) &&
    resolveGithubMentionQuery.isFetching &&
    authoritativeResolvedGithubUser === null

  const mentionTypingOrResolveBlocking =
    trigger !== null ||
    showGithubResolveLoading ||
    atMentionsMissingChips.length > 0

  const canSendComposer =
    Boolean(composedMessage.trim()) &&
    !disabled &&
    !mentionTypingOrResolveBlocking

  const {
    mentionsAttachBelow,
    composerSurfaceRef,
    inlineComposeRef,
    chipAttachmentStripRef,
  } = useMentionChipAttachmentBelow({
    mentionCount: mentions.length,
    textForMeasure: text,
  })

  const resetComposer = useCallback(() => {
    setText("")
    setMentions([])
    setDismissedTriggerKey(null)
    setHighlightedIndex(0)
  }, [])

  const submitComposer = useCallback(async () => {
    if (!canSendComposer) return
    const message = composedMessage.trim()

    if (slashCommandRunner) {
      const parsed = parseCommand(message)
      if (parsed) {
        const snapshotText = text
        const snapshotMentions = mentions
        resetComposer()
        try {
          const r = await slashCommandRunner.run(message)
          if (r.status === "error") {
            setText(snapshotText)
            setMentions(snapshotMentions)
          }
        } catch {
          setText(snapshotText)
          setMentions(snapshotMentions)
        }
        return
      }
    }

    onSend(message)
    resetComposer()
  }, [
    canSendComposer,
    composedMessage,
    mentions,
    onSend,
    resetComposer,
    slashCommandRunner,
    text,
  ])

  const selectSlashRef = useRef<(cmd: SlashCommand) => Promise<void>>(
    async () => {}
  )

  const slashInput = useSlashCommandInput({
    inputValue: text,
    setInputValue: setText,
    onSubmit: () => {
      void submitComposer()
    },
    onSelectCommand: (cmd) => {
      void selectSlashRef.current(cmd)
    },
    inputRef,
  })

  selectSlashRef.current = async (cmd: SlashCommand) => {
    if (mentionTypingOrResolveBlocking) return
    const line = composedMessage.trim()
    const exactCommand =
      line === cmd.command || line.startsWith(`${cmd.command} `)
    const args = exactCommand ? line.slice(cmd.command.length).trim() : ""

    if (cmd.requiresArg && !args) {
      setText(`${cmd.command} `)
      slashInput.setPaletteIndex(0)
      inputRef.current?.focus()
      return
    }

    const raw = exactCommand ? line : cmd.command
    if (!slashCommandRunner || !parseCommand(raw)) return

    const snapshotText = text
    const snapshotMentions = mentions
    resetComposer()
    try {
      const r = await slashCommandRunner.run(raw)
      if (r.status === "error") {
        setText(snapshotText)
        setMentions(snapshotMentions)
      }
    } catch {
      setText(snapshotText)
      setMentions(snapshotMentions)
    }
  }

  const showSlashPalette = Boolean(slashCommandRunner && slashInput.showPalette)

  const showMentionSuggestions =
    !disabled &&
    !!trigger &&
    triggerKey !== dismissedTriggerKey &&
    (mentionSelectableRows.length > 0 || showGithubResolveLoading)

  const showSuggestionsEffective = showMentionSuggestions && !showSlashPalette

  const activeSuggestion = showSuggestionsEffective
    ? mentionSelectableRows[highlightedIndex]
    : undefined

  const activeSuggestionId = activeSuggestion
    ? `${suggestionListId}-${activeSuggestion.list}-${activeSuggestion.githubUsername.toLowerCase()}`
    : undefined

  const parsedSlashLine = slashCommandRunner ? parseCommand(text.trim()) : null
  const showSlashArgHint =
    Boolean(slashCommandRunner) &&
    !slashInput.showPalette &&
    !showSuggestionsEffective &&
    parsedSlashLine !== null

  function updateCursor(element: HTMLInputElement) {
    setCursorPosition(element.selectionStart ?? element.value.length)
  }

  function selectMention(user: ListedUserSuggestion) {
    if (!trigger) return

    const slashLine =
      Boolean(slashCommandRunner) && text.trimStart().startsWith("/")
    const next = slashLine
      ? stripMentionTriggerOnly(text, trigger)
      : replaceMentionTrigger(text, trigger, user.githubUsername)

    setDismissedTriggerKey(null)
    setMentions((current) => {
      const key = user.githubUsername.toLowerCase()
      if (current.some((m) => m.githubUsername.toLowerCase() === key)) {
        return current
      }
      return [...current, user]
    })
    setText(next.value)
    setHighlightedIndex(0)
    window.requestAnimationFrame(() => {
      const input = inputRef.current
      if (!input) return
      input.focus()
      input.setSelectionRange(next.cursorPosition, next.cursorPosition)
      setCursorPosition(next.cursorPosition)
    })
  }

  function removeMention(username: string) {
    setMentions((current) =>
      current.filter(
        (m) => m.githubUsername.toLowerCase() !== username.toLowerCase()
      )
    )
  }

  const mentionChipElements = mentions.map((user) => (
    <UserMentionChip
      key={`${user.list}-${user.githubUsername}`}
      username={user.githubUsername}
      avatarUrl={user.avatarUrl}
      onRemove={() => removeMention(user.githubUsername)}
    />
  ))

  const showInlineChipsRow = mentions.length > 0 && !mentionsAttachBelow

  function sendMessage() {
    void submitComposer()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) {
      return
    }

    if (showSlashPalette) {
      slashInput.handleKeyDown(event)
      return
    }

    if (showSuggestionsEffective && event.key === "ArrowDown") {
      if (mentionSelectableRows.length === 0) return
      event.preventDefault()
      setHighlightedIndex(
        (current) => (current + 1) % mentionSelectableRows.length
      )
      return
    }

    if (showSuggestionsEffective && event.key === "ArrowUp") {
      if (mentionSelectableRows.length === 0) return
      event.preventDefault()
      setHighlightedIndex(
        (current) =>
          (current - 1 + mentionSelectableRows.length) %
          mentionSelectableRows.length
      )
      return
    }

    if (showSuggestionsEffective && event.key === "Enter") {
      const highlighted = mentionSelectableRows[highlightedIndex]
      if (highlighted) {
        event.preventDefault()
        selectMention(highlighted)
      }
      return
    }

    if (showSuggestionsEffective && event.key === "Escape") {
      event.preventDefault()
      setDismissedTriggerKey(triggerKey)
      return
    }

    if (event.key === "Backspace" && text.length === 0 && mentions.length > 0) {
      removeMention(mentions[mentions.length - 1].githubUsername)
      return
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      if (canSendComposer) {
        sendMessage()
      }
    }
  }

  return (
    <div
      className={cn(
        "relative flex flex-col items-start gap-0 rounded-2xl bg-tw-card p-1.5",
        className
      )}
    >
      {showSlashPalette ? (
        <CommandPalette
          commands={slashInput.paletteCommands}
          selectedIndex={slashInput.paletteIndex}
          onSelect={(cmd) => {
            void selectSlashRef.current(cmd)
          }}
          onHover={slashInput.setPaletteIndex}
        />
      ) : null}
      {showSlashArgHint && parsedSlashLine ? (
        <CommandArgHint parsed={parsedSlashLine} />
      ) : null}
      {showSuggestionsEffective && trigger ? (
        <div
          id={suggestionListId}
          role="listbox"
          className="absolute right-1.5 bottom-full left-1.5 z-20 mb-1.5 overflow-hidden rounded-2xl bg-tw-card p-1.5 shadow-[0_8px_24px_#00000040,0_1px_2px_#0000001a]"
        >
          {showGithubResolveLoading ? (
            <div className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-tw-text-secondary">
              <UnicodeSpinner variant="orbit" />
              <span className="min-w-0 flex-1 truncate text-[13px]">
                Looking up @{trigger.query}
              </span>
            </div>
          ) : null}
          {mentionSelectableRows.map((user, index) => {
            const optionId = `${suggestionListId}-${user.list}-${user.githubUsername.toLowerCase()}`

            return (
              <Button
                variant="ghost"
                type="button"
                id={optionId}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlightedIndex}
                key={optionId}
                onMouseDown={(event) => {
                  event.preventDefault()
                  selectMention(user)
                }}
                className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition-colors ${
                  index === highlightedIndex
                    ? "bg-tw-hover"
                    : "hover:bg-tw-hover"
                }`}
              >
                <MentionAvatar user={user} />
                <span className="min-w-0 flex-1 truncate text-[13px] text-tw-text-primary">
                  @{user.githubUsername}
                </span>
                <span
                  className={cn(
                    "rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                    user.list !== "github" ? "capitalize" : "",
                    listClasses(user.list)
                  )}
                >
                  {listBadgeLabel(user.list)}
                </span>
              </Button>
            )
          })}
        </div>
      ) : null}

      <div
        ref={composerSurfaceRef}
        className={cn(
          "flex min-h-9 w-full min-w-0 rounded-[10px] bg-tw-inner px-1.5 py-1",
          mentions.length > 0 &&
            mentionsAttachBelow &&
            "min-h-0 flex-col gap-1.5 pb-2"
        )}
      >
        <div
          ref={inlineComposeRef}
          className={cn(
            "flex min-h-9 w-full min-w-0 items-center gap-1.5",
            showInlineChipsRow && "flex-nowrap"
          )}
        >
          <input
            ref={inputRef}
            type="text"
            placeholder={mentions.length > 0 ? "" : placeholder}
            value={text}
            onChange={(event) => {
              slashInput.handleInputChange(event)
              updateCursor(event.target)
              setDismissedTriggerKey(null)
              setHighlightedIndex(0)
            }}
            onClick={(event) => updateCursor(event.currentTarget)}
            onKeyUp={(event) => updateCursor(event.currentTarget)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            role="combobox"
            aria-autocomplete="list"
            aria-controls={suggestionListId}
            aria-expanded={showSuggestionsEffective}
            aria-activedescendant={activeSuggestionId}
            className={cn(
              "h-8 min-h-8 min-w-0 flex-1 rounded-md bg-transparent px-1.5 text-[14px] leading-none text-tw-text-primary outline-none placeholder:text-tw-text-tertiary disabled:opacity-50",
              showInlineChipsRow && "min-w-[8rem] shrink"
            )}
          />
          {showInlineChipsRow ? mentionChipElements : null}
          <Button
            variant="ghost"
            type="button"
            aria-label="Voice input unavailable"
            title="Voice input unavailable"
            disabled
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-tw-text-tertiary transition-colors hover:text-tw-text-secondary disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:text-tw-text-tertiary"
          >
            <MicIcon />
          </Button>
        </div>
        {mentionsAttachBelow && mentions.length > 0 ? (
          <div
            ref={chipAttachmentStripRef}
            role="group"
            aria-label="Mentions"
            className="-mx-0.5 flex max-w-full min-w-0 flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain px-0.5 [scrollbar-width:thin]"
          >
            {mentionChipElements}
          </div>
        ) : null}
      </div>
      <div className="flex w-full items-center justify-between pt-1.5">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            type="button"
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
          >
            <PlusIcon />
            <span className="text-[12px]">Add files</span>
          </Button>
          <Button
            variant="ghost"
            type="button"
            className="flex h-7 items-center gap-1 rounded-lg px-2 text-tw-text-tertiary transition-colors hover:bg-tw-hover hover:text-tw-text-secondary"
          >
            <PlusIcon />
            <span className="text-[12px]">Add context</span>
            {contextActionAdornment}
          </Button>
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={sendMessage}
          disabled={!canSendComposer}
          className="flex items-center justify-center gap-1 self-stretch rounded-[10px] bg-[#363639] px-1.5 transition-colors hover:bg-[#404044] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className="px-0.5 text-center text-[14px] leading-none text-tw-text-primary">
            {isLoading ? "..." : "Go"}
          </span>
          <span
            className="flex h-4 items-center justify-center rounded-sm bg-[#222222] px-1 pt-[3px] pb-0"
            style={{ boxShadow: "#0000001A 0px 1px 1px" }}
          >
            <span className="text-center text-[11px] leading-none text-tw-text-tertiary">
              {"\u21B5"}
            </span>
          </span>
        </Button>
      </div>
    </div>
  )
}
