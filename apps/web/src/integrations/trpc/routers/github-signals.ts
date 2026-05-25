import { z } from "zod"
import { authedProcedure } from "../init"
import { getGitHubRevalidationSignals } from "@tripwire/github/cache"

import type { TRPCRouterRecord } from "@trpc/server"

/**
 * Surface the github_revalidation_signal table to the browser so it can
 * poll for "any of these signal keys been bumped since I last fetched?"
 * The browser uses this as the safety net for missed WebSocket broadcasts
 * (and as the only realtime path until WS lands).
 *
 * Authed because the signal table reveals which entities are being
 * touched in the system — not a privacy boundary, but no reason to
 * make it public either.
 */
export const githubSignalsRouter = {
  timestamps: authedProcedure
    .input(z.object({ signalKeys: z.array(z.string()).max(64) }))
    .query(async ({ input }) => {
      const rows = await getGitHubRevalidationSignals(input.signalKeys)
      return rows.map((row) => ({
        signalKey: row.signalKey,
        updatedAt: row.updatedAt,
      }))
    }),
} satisfies TRPCRouterRecord
