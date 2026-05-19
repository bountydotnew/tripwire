import { useEffect } from "react"
import { Button } from "#/components/ui/button"
import { PlusStrokeIcon14 } from "#/components/icons/app-chrome-icons"
import { ChatThread } from "#/components/chat/chat-thread"
import { ChatComposer } from "#/components/chat/chat-composer"
import { useAIChat } from "#/components/chat/chat-context"
import Dither from "#/components/Dither"

interface AgentPanelProps {
  workflowId?: string
}

export function AgentPanel({ workflowId }: AgentPanelProps) {
  const {
    messages,
    isLoading,
    error,
    isQuotaExhausted,
    sendMessage,
    respondToToolApproval,
    setWorkflowContext,
    newChat,
  } = useAIChat()

  useEffect(() => {
    if (workflowId) {
      setWorkflowContext({ workflowId })
    }
    return () => {
      setWorkflowContext(null)
    }
  }, [workflowId, setWorkflowContext])

  return (
    <div className="relative flex h-full flex-col">
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
          waveColor={[
            0.4627450980392157, 0.4627450980392157, 0.4627450980392157,
          ]}
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

      <div className="relative z-10 flex shrink-0 items-center justify-end px-4 pt-2 pb-1">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={newChat}
          title="New chat"
        >
          <PlusStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
      </div>

      <div className="relative z-10 min-h-0 flex-1 overflow-auto px-2 py-2">
        <ChatThread
          messages={messages}
          isLoading={isLoading}
          error={error}
          isQuotaExhausted={isQuotaExhausted}
          respondToToolApproval={respondToToolApproval}
        />
      </div>

      <div className="relative z-10 shrink-0 border-t border-tw-border px-3 py-3">
        <ChatComposer
          disabled={isLoading || isQuotaExhausted}
          isLoading={isLoading}
          placeholder="Generate nodes, edit triggers, or ask about this workflow..."
          onSend={sendMessage}
        />
      </div>
    </div>
  )
}
