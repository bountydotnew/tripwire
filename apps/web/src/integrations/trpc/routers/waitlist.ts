import { z } from "zod"
import { createHash } from "node:crypto"
import { createTRPCRouter, publicProcedure } from "../init"
import { db } from "@tripwire/db/client"
import { waitlist } from "@tripwire/db"
import { checkRateLimit } from "@tripwire/ratelimit"
import { trpcError } from "../error"

export const waitlistRouter = createTRPCRouter({
  join: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .mutation(async ({ input }) => {
      // Rate limit by a stable hash of the (lowercased) email. The previous
      // x-forwarded-for-based identifier was trivially spoofable.
      const identifier = createHash("sha256")
        .update(input.email.toLowerCase())
        .digest("hex")
        .slice(0, 32)
      await checkRateLimit("waitlist", identifier)

      try {
        await db.insert(waitlist).values({ email: input.email })
        return { success: true }
      } catch (err) {
        // Handle unique constraint violation (already on waitlist)
        if (err instanceof Error && err.message.includes("unique constraint")) {
          throw trpcError({
            code: "waitlist.already_joined",
            status: 409,
            message: "You're already on the waitlist!",
            fix: "Watch the inbox you used — we'll email when access opens.",
            cause: err,
          })
        }
        throw err
      }
    }),
})
