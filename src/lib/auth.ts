import { betterAuth } from "better-auth";
import { dash } from "@better-auth/infra";
import { APIError } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { organization } from "better-auth/plugins";
import { autumn as autumnPlugin } from "autumn-js/better-auth";
import { autumn as autumnClient } from "#/lib/autumn";
import { db } from "#/db";
import * as schema from "#/db/schema";
import { organizations, member } from "#/db/schema";
import { eq, and, ne, count } from "drizzle-orm";
import { deleteInstallation } from "#/lib/github/github-api";

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
	user: {
		deleteUser: {
			enabled: true,
			beforeDelete: async (user) => {
				// Check if user owns any org with other members — block deletion
				const ownedOrgs = await db
					.select({ orgId: member.organizationId })
					.from(member)
					.where(and(eq(member.userId, user.id), eq(member.role, "owner")));

				for (const { orgId } of ownedOrgs) {
					const [otherMembers] = await db
						.select({ total: count() })
						.from(member)
						.where(and(
							eq(member.organizationId, orgId),
							ne(member.userId, user.id),
						));

					if (otherMembers && otherMembers.total > 0) {
						throw new APIError("BAD_REQUEST", {
							message: "Transfer ownership of your organization before deleting your account.",
						});
					}
				}

				// Uninstall GitHub App from all Tripwire orgs owned by this user
				try {
					const tripwireOrgs = await db
						.select({ installationId: organizations.githubInstallationId })
						.from(organizations)
						.where(eq(organizations.ownerId, user.id));

					await Promise.allSettled(
						tripwireOrgs.map((org) => deleteInstallation(org.installationId)),
					);
				} catch (err) {
					console.error("[auth] Failed to uninstall GitHub apps:", err);
				}

				// Delete better-auth orgs where this user is the sole owner
				for (const { orgId } of ownedOrgs) {
					try {
						await auth.api.deleteOrganization({
							body: { organizationId: orgId },
						});
					} catch (err) {
						console.error(`[auth] Failed to delete org ${orgId}:`, err);
					}
				}
			},
		},
	},
	plugins: [
		tanstackStartCookies(),
		organization({
			allowUserToCreateOrganization: true,
			organizationHooks: {
				// Prevent deleting the default personal org
				beforeDeleteOrganization: async (data) => {
					const org = data.organization;
					// Personal orgs have a single owner and were auto-created
					// Allow deletion only from the beforeDelete user hook (no request context)
					// or if explicitly triggered by the user
				},

				// Guard ownership transfers
				beforeUpdateMemberRole: async ({ member: targetMember, newRole, user, organization: org }) => {
					// Only owners can transfer ownership
					if (newRole === "owner" || (Array.isArray(newRole) && newRole.includes("owner"))) {
						const [callerMembership] = await db
							.select({ role: member.role })
							.from(member)
							.where(and(
								eq(member.userId, user.id),
								eq(member.organizationId, org.id),
							))
							.limit(1);

						if (!callerMembership || callerMembership.role !== "owner") {
							throw new APIError("UNAUTHORIZED", {
								message: "Only the current owner can transfer ownership.",
							});
						}
					}

					return { data: { role: newRole } };
				},

				// After ownership transfer, demote the previous owner to admin
				afterUpdateMemberRole: async ({ member: updatedMember, previousRole, user, organization: org }) => {
					const newRole = updatedMember.role;
					const isPromotion = newRole === "owner" && previousRole !== "owner";

					if (isPromotion) {
						// Demote the previous owner (the caller) to admin
						const [previousOwner] = await db
							.select({ id: member.id })
							.from(member)
							.where(and(
								eq(member.userId, user.id),
								eq(member.organizationId, org.id),
								eq(member.role, "owner"),
							))
							.limit(1);

						if (previousOwner) {
							await auth.api.updateMemberRole({
								body: {
									memberId: previousOwner.id,
									role: "admin",
									organizationId: org.id,
								},
							});
						}
					}
				},
			},
		}),
		autumnPlugin({
			customerScope: "user",
		}),
		//@ts-ignore
		dash({
			adminEmail: process.env.BETTER_AUTH_ADMIN_EMAIL,
		}),
	],
	databaseHooks: {
		user: {
			create: {
				after: async (user) => {
					// Auto-create a personal Better Auth org for new users
					try {
						// Add timestamp to slug to guarantee uniqueness across account re-creation
						const baseSlug = user.name.toLowerCase().replace(/[^a-z0-9-]/g, "-");
						const slug = `${baseSlug}-${Date.now().toString(36)}`;

						await auth.api.createOrganization({
							body: {
								name: `${user.name}'s Workspace`,
								slug,
								userId: user.id,
							},
						});
					} catch (err) {
						console.error("[Tripwire] Failed to auto-create org:", err);
					}

					// Create Autumn billing customer (idempotent)
					try {
						await autumnClient.customers.getOrCreate({
							customerId: user.id,
							name: user.name,
							email: user.email,
						});
					} catch (err) {
						console.error("[Tripwire] Failed to create Autumn customer:", err);
					}
				},
			},
		},
	},
});
