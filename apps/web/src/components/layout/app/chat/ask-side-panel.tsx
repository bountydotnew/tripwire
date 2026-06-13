import { useState } from "react"
import { useNavigate } from "@tanstack/react-router"
import { useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from "@tripwire/ui/context"
import { AI_MODEL_ID, getContextWindow } from "@tripwire/ai/model-config"
import { TripwireAskGlyphIcon18 } from "@tripwire/ui/icons/tripwire-ask-glyph-icon"
import {
  PlusStrokeIcon14,
  StrokeXIcon14,
} from "@tripwire/ui/icons/app-chrome-icons"
import { ExpandChatIcon14 } from "@tripwire/ui/icons/expand-chat-icon"
import Dither from "#/components/shared/dither"
import { ChatComposer } from "#/components/layout/app/chat/chat-composer"
import { ChatThread } from "#/components/layout/app/chat/chat-thread"
import { CommandConfirmation } from "#/components/layout/app/chat/command-confirmation"
import { CreditBalancePill } from "#/components/layout/app/shell/credit-balance-pill"
import { SidebarRecentChats } from "#/components/layout/app/shell/sidebar-recent-chats"
import { useAIChat } from "#/providers/chat-context"
import { useTRPC } from "#/integrations/trpc/react"
import { useChatUsage } from "#/hooks/use-chat-usage"
import { useSlashCommandRunner } from "#/lib/chat/use-command-runner"
import { parseCommand } from "#/lib/chat/commands"

const DITHER_WAVE_GRAY: [number, number, number] = [
  0.4627450980392157, 0.4627450980392157, 0.4627450980392157,
]

export function AskSidePanel() {
  const {
    close,
    sendMessage,
    isLoading,
    isQuotaExhausted,
    newChat,
    conversationId,
    repoId: chatRepoId,
    messages: chatMessages,
  } = useAIChat()
  const navigate = useNavigate()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [mutationLoading, setMutationLoading] = useState(false)

  const { runCommand, runMutation, cancelMutation, pendingConfirmation } =
    useSlashCommandRunner()

  const chatUsage = useChatUsage(chatMessages)

  const handleConfirmMutation = async () => {
    if (!pendingConfirmation) return
    setMutationLoading(true)
    try {
      await runMutation(pendingConfirmation)
    } finally {
      setMutationLoading(false)
    }
  }

  const openFullScreenChat = () => {
    queryClient.setQueryData(
      trpc.chats.get.queryKey({ chatId: conversationId }),
      {
        id: conversationId,
        userId: "",
        organizationId: "",
        repoId: chatRepoId ?? null,
        title: null,
        messages: chatMessages as unknown as Record<string, unknown>[],
        createdAt: new Date(),
        updatedAt: new Date(),
      }
    )
    close()
    navigate({
      to: "/chat/$chatId",
      params: { chatId: conversationId },
    })
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[350px]"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
        }}
      >
        <Dither
          waveColor={DITHER_WAVE_GRAY}
          disableAnimation={false}
          enableMouseInteraction={false}
          mouseRadius={0.1}
          colorNum={4}
          pixelSize={2}
          waveAmplitude={0.25}
          waveFrequency={3}
          waveSpeed={0.1}
        />
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-between pt-3 pr-2 pb-2 pl-3">
        <div className="flex min-w-0 items-center gap-2">
          <TripwireAskGlyphIcon18 />
          <span className="text-[14px] leading-none font-medium text-tw-text-primary">
            Ask Tripwire
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Context
            usedTokens={chatUsage.totalTokens}
            maxTokens={getContextWindow(AI_MODEL_ID)}
            usage={{
              inputTokens: chatUsage.inputTokens,
              outputTokens: chatUsage.outputTokens,
            }}
            modelId={AI_MODEL_ID}
            costUSD={chatUsage.costUSD}
          >
            <ContextTrigger className="h-6 px-1.5 text-[11px] text-tw-text-muted" />
            <ContextContent>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
              </ContextContentBody>
              <ContextContentFooter />
            </ContextContent>
          </Context>
          <CreditBalancePill />
          <Button
            variant="ghost"
            onClick={openFullScreenChat}
            type="button"
            className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
            title="Open in full screen"
          >
            <ExpandChatIcon14 className="text-[#9F9FA9]" />
          </Button>
          <Button
            variant="ghost"
            onClick={newChat}
            type="button"
            className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
            title="New chat"
          >
            <PlusStrokeIcon14 className="text-[#9F9FA9]" />
          </Button>
          <Button
            variant="ghost"
            onClick={close}
            type="button"
            className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-tw-hover"
          >
            <StrokeXIcon14 className="text-[#9F9FA9]" />
          </Button>
        </div>
      </div>

      <div className="relative z-10 shrink-0 px-3 pb-3">
        <p className="text-[13px] leading-[19px] text-tw-text-secondary">
          Ask about anything in your digest, or get help investigating a flagged
          contributor.
        </p>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-auto px-2 pb-2 scroll-mask-y-from-[calc(100%-2rem)]">
        <ChatThread />
      </div>

      <div className="relative z-10">
        <SidebarRecentChats />
      </div>

      <div className="relative z-10 shrink-0 px-2 pb-2">
        {pendingConfirmation ? (
          <CommandConfirmation
            confirmation={pendingConfirmation}
            onConfirm={handleConfirmMutation}
            onCancel={cancelMutation}
            isLoading={mutationLoading}
          />
        ) : null}
        <ChatComposer
          disabled={isLoading || isQuotaExhausted || mutationLoading}
          isLoading={isLoading}
          placeholder={
            isQuotaExhausted
              ? "Out of credits"
              : "Ask anything, or type / for commands..."
          }
          onSend={sendMessage}
          slashCommandRunner={{
            run: async (raw) => {
              const parsed = parseCommand(raw.trim())
              if (!parsed) {
                return { status: "error", message: "Unknown command" }
              }
              const result = await runCommand(parsed)
              if (result.kind === "error") {
                return { status: "error", message: result.message }
              }
              return { status: "done" }
            },
          }}
        />
      </div>
    </div>
  )
}
