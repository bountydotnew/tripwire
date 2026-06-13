import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogDescription,
  DialogPortal,
  DialogPrimitive,
  DialogTitle,
} from "@tripwire/ui/dialog"

interface RepoSwitchDialogProps {
  open: boolean
  currentRepoName: string | null
  nextRepoName: string | null
  onCancel: () => void
  onProceed: () => void
  onNewChat: () => void
}

export function RepoSwitchDialog({
  open,
  currentRepoName,
  nextRepoName,
  onCancel,
  onProceed,
  onNewChat,
}: RepoSwitchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onCancel())}>
      <DialogPortal>
        <DialogBackdrop />
        <DialogPrimitive.Popup
          className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col rounded-xl border border-tw-border bg-tw-surface text-tw-text-primary shadow-2xl outline-none transition-[scale,opacity] duration-200 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 max-sm:fixed max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-b-none max-sm:data-ending-style:translate-y-4 max-sm:data-ending-style:scale-100 max-sm:data-starting-style:translate-y-4 max-sm:data-starting-style:scale-100"
          data-slot="dialog-popup"
        >
          <div className="flex flex-col gap-2 px-5 pt-5 pb-3">
            <DialogTitle>Switch chat context?</DialogTitle>
            <DialogDescription className="text-[13px] text-tw-text-secondary">
              You have an open chat about{" "}
              <span className="text-tw-text-primary">
                {currentRepoName ?? "the current repo"}
              </span>
              . Switching to{" "}
              <span className="text-tw-text-primary">
                {nextRepoName ?? "the new repo"}
              </span>{" "}
              will make the agent re-fetch repo details for this thread. If
              you&apos;d rather keep this conversation clean, start a new chat
              instead.
            </DialogDescription>
          </div>
          <div className="flex justify-end gap-2 rounded-b-xl border-t border-tw-border bg-tw-bg/50 px-5 py-4">
            <DialogClose render={<Button variant="outline" size="sm" />}>
              Cancel
            </DialogClose>
            <Button variant="outline" size="sm" onClick={onNewChat}>
              Start new chat
            </Button>
            <Button variant="default" size="sm" onClick={onProceed}>
              Switch context
            </Button>
          </div>
        </DialogPrimitive.Popup>
      </DialogPortal>
    </Dialog>
  )
}
