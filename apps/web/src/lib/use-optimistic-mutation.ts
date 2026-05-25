import { type QueryKey, useQueryClient } from "@tanstack/react-query"
import { useCallback } from "react"

/**
 * One optimistic patch. Two forms:
 *
 * - **Exact key**: target one specific query by its `queryKey`. Use when
 *   the caller knows the precise key (e.g. a singleton viewer query).
 * - **Predicate**: walk every query in the cache and apply the updater to
 *   each match. Use when several variants of a list exist (different
 *   filter/sort/pagination params) and they all need the same patch.
 *
 * In both cases the updater receives the current cached value (skipped
 * entirely when the slot hasn't loaded yet) and returns the new value.
 * Returning `current` leaves the cache untouched.
 */
export type OptimisticUpdate =
  | {
      queryKey: QueryKey
      // biome-ignore lint/suspicious/noExplicitAny: updater accepts any cached shape
      updater: (current: any) => any
    }
  | {
      predicate: (queryKey: QueryKey) => boolean
      // biome-ignore lint/suspicious/noExplicitAny: updater accepts any cached shape
      updater: (current: any) => any
    }

export type OptimisticMutateOptions<TResult> = {
  /** The server call, e.g. `() => trpc.visibility.bulkAction.mutate({...})`. */
  mutationFn: () => Promise<TResult>
  /** Optimistic cache patches applied synchronously before the server call. */
  updates?: OptimisticUpdate[]
  /**
   * Query key prefix to invalidate on success. Only used when no optimistic
   * updates were applied — otherwise we trust the optimistic state + let the
   * signal stream / poll bring canonical data when the server-side mutation
   * has fully propagated. Default: `["github"]`.
   */
  invalidateQueryKey?: QueryKey
  /**
   * Custom success predicate. Default: `Boolean(result)`. Lets callers treat
   * `{ ok: false, error: "..." }` results as failures (triggering rollback)
   * without throwing.
   */
  isSuccess?: (result: TResult) => boolean
}

/**
 * Subset of QueryClient we need. Defined so unit tests can pass a stub
 * without dragging in a real react-query setup.
 */
export type OptimisticMutationQueryClient = {
  getQueryData(queryKey: QueryKey): unknown
  setQueryData(
    queryKey: QueryKey,
    updater: unknown | ((current: unknown) => unknown),
  ): unknown
  /** react-query's predicate-based bulk update — walks the cache and updates matches. */
  setQueriesData(
    filters: { predicate: (query: { queryKey: QueryKey }) => boolean },
    updater: unknown | ((current: unknown) => unknown),
  ): unknown
  /** Snapshot every query matching the predicate as [queryKey, data] pairs for rollback. */
  getQueriesData(filters: {
    predicate: (query: { queryKey: QueryKey }) => boolean
  }): Array<[QueryKey, unknown]>
  invalidateQueries(filters: { queryKey: QueryKey }): Promise<void>
}

/**
 * Generic optimistic-mutation runner. Different from a vanilla
 * `useMutation({ onMutate, onError, onSuccess })` in two ways:
 *
 * 1. **Skip-invalidate-when-optimistic-was-applied.** When the optimistic
 *    cache already reflects the post-mutation state, fetching again
 *    immediately can flash stale server data back into the UI (the server
 *    hasn't propagated the write yet — tRPC returned but the read path
 *    may still see the pre-write row). With the signal-stream wiring in
 *    place, the webhook driven by the mutation will bring fresh data
 *    when the server is actually consistent.
 *
 * 2. **Rollback restores prior snapshots exactly.** On failure, we put
 *    back what was there — not a re-fetch (which could blank the UI
 *    while the network roundtrip runs).
 *
 * For mutations that DON'T do optimistic updates, this falls through to
 * a standard `await mutationFn() → invalidateQueries(invalidateQueryKey)`.
 */
export async function runOptimisticMutation<TResult>(
  queryClient: OptimisticMutationQueryClient,
  options: OptimisticMutateOptions<TResult>,
): Promise<TResult | undefined> {
  const {
    mutationFn,
    updates = [],
    invalidateQueryKey = ["github"],
    isSuccess = (result: TResult) => Boolean(result),
  } = options

  const hasOptimisticUpdates = updates.length > 0

  /**
   * Snapshots accumulate per matching (queryKey, prior-data) pair so we
   * can restore the EXACT prior shape on failure. For predicate updates
   * we resolve the matches up front rather than re-evaluating later —
   * the cache could change underneath us mid-mutation.
   */
  const snapshots: Array<{ queryKey: QueryKey; data: unknown }> = []

  for (const update of updates) {
    if ("queryKey" in update) {
      snapshots.push({
        queryKey: update.queryKey,
        data: queryClient.getQueryData(update.queryKey),
      })
      queryClient.setQueryData(update.queryKey, (current: unknown) => {
        if (current === undefined) return current
        return update.updater(current)
      })
    } else {
      const matches = queryClient.getQueriesData({
        predicate: (query) => update.predicate(query.queryKey),
      })
      for (const [queryKey, data] of matches) {
        snapshots.push({ queryKey, data })
      }
      queryClient.setQueriesData(
        { predicate: (query) => update.predicate(query.queryKey) },
        (current: unknown) => {
          if (current === undefined) return current
          return update.updater(current)
        },
      )
    }
  }

  try {
    const result = await mutationFn()

    if (isSuccess(result)) {
      if (!hasOptimisticUpdates) {
        await queryClient.invalidateQueries({
          queryKey: invalidateQueryKey,
        })
      }
      return result
    }

    // isSuccess returned false → treat as failure, rollback.
    for (const snapshot of snapshots) {
      queryClient.setQueryData(snapshot.queryKey, snapshot.data)
    }
    return result
  } catch {
    for (const snapshot of snapshots) {
      queryClient.setQueryData(snapshot.queryKey, snapshot.data)
    }
    return undefined
  }
}

/** React-bound thin wrapper — picks up the QueryClient from context. */
export function useOptimisticMutation() {
  const queryClient = useQueryClient()

  const mutate = useCallback(
    <TResult>(options: OptimisticMutateOptions<TResult>) =>
      runOptimisticMutation(queryClient as unknown as OptimisticMutationQueryClient, options),
    [queryClient],
  )

  return { mutate }
}
