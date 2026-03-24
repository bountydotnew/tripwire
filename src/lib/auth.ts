import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { db } from "#/db";
import * as schema from "#/db/schema";

export const auth = betterAuth({
	baseURL: process.env.BETTER_AUTH_URL,
	secret: process.env.BETTER_AUTH_SECRET,
	trustedOrigins: [
		"https://tripwire.sh",
		"https://www.tripwire.sh",
		"http://localhost:3000",
	],
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	socialProviders: {
		github: {
			clientId: process.env.GITHUB_CLIENT_ID!,
			clientSecret: process.env.GITHUB_CLIENT_SECRET!,
			scope: ["read:user", "user:email", "read:org"],
		},
	},
	plugins: [
		tanstackStartCookies(),
		organization({
			allowUserToCreateOrganization: true,
			organizationHooks: {
				// Auto-create a personal org for new users handled below
			},
		}),
	],
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Auto-create a personal Better Auth org for new users
					try {
						await auth.api.createOrganization({
							body: {
								name: `${user.name}'s Workspace`,
								slug: user.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
								userId: user.id,
							},
						});
					} catch (err) {
						console.error("[Tripwire] Failed to auto-create org:", err);
					}
				},
			},
		},
	},
});
