import { useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/lib/workspace-context"
import { toastManager } from "#/components/ui/toast"

const POLL_INTERVAL_MS = 25_000

function describeKind(kind: string): string {
  if (kind === "unblock") return "Appeal a block"
  if (kind === "access") return "Access request"
  return kind
}

/**
 * Polls pending contributor requests for the user's currently-selected repo
 * and surfaces a toast whenever a new request id appears.
 *
 * - Seeds a ref of known request ids on first successful fetch (no toast).
 * - On subsequent fetches, any id not yet in the ref triggers a toast and
 *   is added to the ref so it isn't toasted again.
 * - Resets tracking when the selected repo changes.
 */
export function useRequestNotifications(): void {
  const trpc = useTRPC()
  const { repo } = useWorkspace()
  const navigate = useNavigate()
  const repoId = repo?.id

  const seenIdsRef = useRef<Set<string>>(new Set())
  const seededRepoIdRef = useRef<string | null>(null)

  const { data } = useQuery(
    trpc.requests.list.queryOptions(
      { repoId: repoId ?? "", status: "pending" },
      {
        enabled: !!repoId,
        staleTime: 0,
        refetchInterval: POLL_INTERVAL_MS,
        refetchIntervalInBackground: false,
      }
    )
  )

  useEffect(() => {
    if (!repoId) return
    if (!data) return

    // On repo switch, reset the seen-set and seed without toasting.
    if (seededRepoIdRef.current !== repoId) {
      const next = new Set<string>()
      for (const req of data) next.add(req.id)
      seenIdsRef.current = next
      seededRepoIdRef.current = repoId
      return
    }

    const newRequests = data.filter((req) => !seenIdsRef.current.has(req.id))
    if (newRequests.length === 0) return

    for (const req of newRequests) {
      seenIdsRef.current.add(req.id)
      toastManager.add({
        title: `New request from @${req.githubUsername}`,
        description: describeKind(req.kind),
        type: "info",
        actionProps: {
          children: "View",
          onClick: () => {
            navigate({
              to: "/",
              search: { tab: "requests" },
            } as never)
          },
        },
      })
    }
  }, [data, repoId, navigate])
}
