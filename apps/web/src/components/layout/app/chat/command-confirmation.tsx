import { AlertCircle, Info } from "lucide-react"
import { Button } from "@tripwire/ui/button"
import type { MutationConfirmation } from "#/lib/chat/commands"

interface CommandConfirmationProps {
  confirmation: MutationConfirmation
  onConfirm: () => void
  onCancel: () => void
  isLoading?: boolean
}

/**
 * Confirmation card above the input when the user runs a mutation slash
 * command (/block, /allow, /unblock, /disallow).
 */
export function CommandConfirmation({
  confirmation,
  onConfirm,
  onCancel,
  isLoading,
}: CommandConfirmationProps) {
  const confirmClasses = confirmation.danger
    ? "bg-tw-error text-white hover:bg-tw-error/90"
    : "bg-tw-text-primary text-[#0D0D0F] hover:opacity-90"
  const Icon = confirmation.danger ? AlertCircle : Info

  return (
    <div className="mb-1.5 flex flex-col gap-2 rounded-xl border border-tw-border/60 bg-tw-card p-3">
      <div className="flex items-start gap-2">
        <Icon
          size={14}
          strokeWidth={1.6}
          className={`${confirmation.danger ? "text-tw-error" : "text-tw-text-muted"} mt-0.5 shrink-0`}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] leading-tight font-medium text-tw-text-primary">
            {confirmation.title}
          </div>
          <div className="mt-1 text-[12px] leading-relaxed text-tw-text-muted">
            {confirmation.description}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          onClick={onConfirm}
          disabled={isLoading}
          className={`h-7 rounded-lg px-3 text-[12px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${confirmClasses}`}
        >
          {isLoading ? "..." : confirmation.confirmLabel}
        </Button>
        <Button
          variant="ghost"
          type="button"
          onClick={onCancel}
          disabled={isLoading}
          className="h-7 rounded-lg px-3 text-[12px] font-medium text-tw-text-secondary hover:text-tw-text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          Cancel
        </Button>
      </div>
    </div>
  )
}
