import { useFeedback, FeedbackForm } from "@tripwire/feedback"
import { XIcon } from "lucide-react"
import {
  Dialog,
  DialogClose,
  DialogPopup,
  DialogDescription,
} from "@tripwire/ui/dialog"

export function FeedbackDialog() {
  const { isOpen, close, config } = useFeedback()

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && close()}>
      <DialogPopup showCloseButton={false}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div>
            <h2 className="font-heading text-base leading-none font-semibold">
              {config.ui?.title ?? "Report an issue"}
            </h2>
            <DialogDescription className="mt-1">
              Let us know what went wrong or what could be better.
            </DialogDescription>
          </div>
          <DialogClose
            aria-label="Close"
            className="flex size-7 shrink-0 items-center justify-center rounded-md text-tw-text-muted transition-colors hover:bg-tw-inner hover:text-tw-text-primary"
          >
            <XIcon className="size-4" />
          </DialogClose>
        </div>
        <div className="px-5 pb-5">
          <FeedbackForm />
        </div>
      </DialogPopup>
    </Dialog>
  )
}
