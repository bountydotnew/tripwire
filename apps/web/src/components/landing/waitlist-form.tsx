import { useState } from "react"
import { useMutation } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { Button } from "#/components/ui/button"

export function WaitlistForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle")
  const [errorMessage, setErrorMessage] = useState("")
  const trpc = useTRPC()

  const joinWaitlist = useMutation(
    trpc.waitlist.join.mutationOptions({
      onSuccess: () => {
        setStatus("success")
        setEmail("")
      },
      onError: (err) => {
        setStatus("error")
        setErrorMessage(err.message)
      },
    })
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setStatus("idle")
    joinWaitlist.mutate({ email })
  }

  return (
    <div className="relative flex h-[65vh] w-full flex-col items-center justify-center gap-10 px-4">
      <div className="flex w-full max-w-xs flex-col items-center gap-4">
        <p className="text-center text-base font-medium text-white">
          catch slop before it catches up with you
        </p>

        {status === "success" ? (
          <div className="text-center text-sm text-tw-success">
            You're on the list!
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex w-full items-start justify-center gap-1.5"
          >
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="enter email"
              className="h-7 w-full rounded-[10px] border border-white/[0.08] bg-white/[0.026] px-2 text-sm text-white placeholder:text-[#999999] focus:border-white/20 focus:outline-none"
            />
            <Button
              type="submit"
              loading={joinWaitlist.isPending}
              variant="outline"
              size="sm"
              className="shrink-0 border-[#CDCDCD] bg-white text-black hover:bg-white/90"
            >
              join waitlist
            </Button>
          </form>
        )}

        {status === "error" && (
          <div className="text-center text-sm text-red-400">{errorMessage}</div>
        )}
      </div>
    </div>
  )
}
