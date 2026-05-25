import {
  type QueryKey,
  useQuery,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query"
import { useMemo } from "react"
import { useGitHubSignalStream } from "./use-signal-stream"

/**
 * Anything resembling a `useQueryOptions(...)` return value. tRPC's
 * `trpc.X.Y.queryOptions(input)` produces exactly this shape, as does
 * react-query's `queryOptions()`. We don't lock to either so the
 * wrapper composes cleanly with any source.
 */
type LiveQueryInputOptions<TData, TError = Error> = Omit<
  UseQueryOptions<TData, TError>,
  "queryKey"
> & {
  queryKey: QueryKey
}

/**
 * Wraps a query with:
 * 1. `meta.persist: true` — successful payloads hydrate from localStorage
 *    on cold load (see `integrations/tanstack-query/persistence.ts`).
 * 2. A `useGitHubSignalStream` subscription — webhooks bumping any of
 *    `signalKeys` invalidate this query within ~1s (SSE) with a 20s
 *    poll safety net.
 *
 * Conceptually equivalent to:
 *   const q = useQuery({ ...options, meta: { persist: true } })
 *   useGitHubSignalStream([{ queryKey: options.queryKey, signalKeys }])
 *   return q
 *
 * Bundling them is purely about cutting repetition at the call site —
 * the underlying primitives stay separately testable and usable in
 * isolation when the wrapper doesn't fit.
 */
export function useLiveGitHubQuery<TData, TError = Error>(
  options: LiveQueryInputOptions<TData, TError>,
  signalKeys: readonly string[],
): UseQueryResult<TData, TError> {
  // Merge persistence flag without clobbering whatever else lives in meta.
  const merged = useMemo(
    () => ({
      ...options,
      meta: { ...(options.meta ?? {}), persist: true } as Record<string, unknown>,
    }),
    [options],
  )

  // Stable targets array so the stream hook's effect doesn't re-subscribe
  // on every render — only when queryKey or signalKeys actually change.
  const streamTargets = useMemo(
    () => [{ queryKey: options.queryKey, signalKeys }],
    [options.queryKey, signalKeys],
  )
  useGitHubSignalStream(streamTargets)

  return useQuery(merged)
}
