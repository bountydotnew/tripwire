import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../init";
import { db } from "#/db";
import { waitlist } from "#/db/schema";
import { checkRateLimit } from "#/lib/ratelimit";
import { TRPCError } from "@trpc/server";

export const waitlistRouter = createTRPCRouter({
	join: publicProcedure
		.input(z.object({ email: z.string().email() }))
		.mutation(async ({ input, ctx }) => {
			// Rate limit by IP or email
			const identifier = ctx.headers?.get("x-forwarded-for") ?? input.email;
			await checkRateLimit("waitlist", identifier);

			try {
				await db.insert(waitlist).values({ email: input.email });
				return { success: true };
			} catch (err) {
				// Handle unique constraint violation (already on waitlist)
				if (
					err instanceof Error &&
					err.message.includes("unique constraint")
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "You're already on the waitlist!",
					});
				}
				throw err;
			}
		}),
});
