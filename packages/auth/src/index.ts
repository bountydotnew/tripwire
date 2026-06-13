import { betterAuth } from "better-auth"
import { dash } from "@better-auth/infra"
import { APIError } from "better-auth/api"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { organization, admin, mcp } from "better-auth/plugins"
import { autumn as autumnPlugin } from "autumn-js/better-auth"
import { autumn as autumnClient } from "./autumn"
import { db } from "@tripwire/db/client"
import * as schema from "@tripwire/db"
import { organizations, member } from "@tripwire/db"
import { env } from "@tripwire/env/server"
import { eq, and, ne, count } from "drizzle-orm"
import { createLogger } from "@tripwire/logger"
import { deleteInstallation } from "@tripwire/github"

const logger = createLogger("auth")

export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  appName: "Tripwire",
  trustedOrigins: [
    "https://tripwire.sh",
    "https://www.tripwire.sh",
    "http://localhost:3000",
  ],
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  // Lets get-session resolve from a short-lived signed cookie instead of
  // hitting the DB on every load, which cuts the grey AuthProvider flash.
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
      strategy: "jwe",
    },
  },
  socialProviders: {
    github: {
      clientId: env.GITHUB_CLIENT_ID ?? "",
      clientSecret: env.GITHUB_CLIENT_SECRET ?? "",
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
          .where(and(eq(member.userId, user.id), eq(member.role, "owner")))

        const otherMemberTotals = await Promise.all(
          ownedOrgs.map(async ({ orgId }) => {
            const [row] = await db
              .select({ total: count() })
              .from(member)
              .where(
                and(
                  eq(member.organizationId, orgId),
                  ne(member.userId, user.id)
                )
              )
            return row?.total ?? 0
          })
        )

        if (otherMemberTotals.some((total) => total > 0)) {
          throw new APIError("BAD_REQUEST", {
            message:
              "Transfer ownership of your organization before deleting your account.",
          })
        }

        // Uninstall GitHub App from all Tripwire orgs owned by this user
        try {
          const tripwireOrgs = await db
            .select({ installationId: organizations.githubInstallationId })
            .from(organizations)
            .where(eq(organizations.ownerId, user.id))

          await Promise.allSettled(
            tripwireOrgs.map((org) => deleteInstallation(org.installationId))
          )
        } catch (err) {
          logger.error("Failed to uninstall GitHub apps", err)
        }

        // Delete better-auth orgs where this user is the sole owner
        await Promise.all(
          ownedOrgs.map(async ({ orgId }) => {
            try {
              await auth.api.deleteOrganization({
                headers: new Headers(),
                body: { organizationId: orgId },
              })
            } catch (err) {
              logger.error("Failed to delete org", { orgId, err })
            }
          })
        )
      },
    },
  },
  plugins: [
    tanstackStartCookies(),
    organization({
      allowUserToCreateOrganization: true,
      organizationHooks: {
        // Prevent deleting the default personal org
        beforeDeleteOrganization: async () => {
          // Personal orgs have a single owner and were auto-created
          // Allow deletion only from the beforeDelete user hook (no request context)
          // or if explicitly triggered by the user
        },

        // Guard ownership transfers
        beforeUpdateMemberRole: async ({
          newRole,
          user,
          organization: org,
        }) => {
          // Only owners can transfer ownership
          if (
            newRole === "owner" ||
            (Array.isArray(newRole) && newRole.includes("owner"))
          ) {
            const [callerMembership] = await db
              .select({ role: member.role })
              .from(member)
              .where(
                and(
                  eq(member.userId, user.id),
                  eq(member.organizationId, org.id)
                )
              )
              .limit(1)

            if (!callerMembership || callerMembership.role !== "owner") {
              throw new APIError("UNAUTHORIZED", {
                message: "Only the current owner can transfer ownership.",
              })
            }
          }

          return { data: { role: newRole } }
        },

        // After ownership transfer, demote the previous owner to admin
        afterUpdateMemberRole: async ({
          member: updatedMember,
          previousRole,
          user,
          organization: org,
        }) => {
          const newRole = updatedMember.role
          const isPromotion = newRole === "owner" && previousRole !== "owner"

          if (isPromotion) {
            // Demote the previous owner (the caller) to admin
            const [previousOwner] = await db
              .select({ id: member.id })
              .from(member)
              .where(
                and(
                  eq(member.userId, user.id),
                  eq(member.organizationId, org.id),
                  eq(member.role, "owner")
                )
              )
              .limit(1)

            if (previousOwner) {
              await auth.api.updateMemberRole({
                headers: new Headers(),
                body: {
                  memberId: previousOwner.id,
                  role: "admin",
                  organizationId: org.id,
                },
              })
            }
          }
        },
      },
    }),
    autumnPlugin({
      // Bill per organization so a Pro upgrade on one workspace doesn't
      // grant Pro entitlements across every org the user belongs to.
      // Legacy user-level Pro is grandfathered via the `metadata.isPersonal`
      // check in `getOrgPlanId` — see apps/web/src/lib/billing.ts.
      customerScope: "organization",
    }),
    admin(),
    mcp({
      loginPage: "/login",
      oidcConfig: {
        loginPage: "/login",
        consentPage: "/oauth/consent",
        storeClientSecret: "hashed",
      },
    }),
    dash({
      apiKey: env.BETTER_AUTH_API_KEY,
    }),
  ],
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // Auto-create a personal Better Auth org for new users
          try {
            // Add timestamp to slug to guarantee uniqueness across account re-creation
            const baseSlug = user.name.toLowerCase().replace(/[^a-z0-9-]/g, "-")
            const slug = `${baseSlug}-${Date.now().toString(36)}`

            await auth.api.createOrganization({
              body: {
                name: `${user.name}'s Workspace`,
                slug,
                userId: user.id,
                // `metadata.isPersonal` marks this as the user's auto-created
                // workspace so the billing layer can grandfather legacy
                // user-level Pro subscriptions to it forever — see
                // `getOrgPlanId` in apps/web/src/lib/billing.ts.
                metadata: {
                  isPersonal: true,
                  personalForUserId: user.id,
                },
              },
            })
          } catch (err) {
            logger.error("Failed to auto-create org", err)
          }

          // Create Autumn billing customer (idempotent)
          try {
            await autumnClient.customers.getOrCreate({
              customerId: user.id,
              name: user.name,
              email: user.email,
            })
          } catch (err) {
            logger.error("Failed to create Autumn customer", err)
          }
        },
      },
    },
  },
  advanced: {
    ipAddress: {
      // For Cloudflare
      //ipAddressHeaders: ["cf-connecting-ip", "x-forwarded-for"],

      // For Vercel
      ipAddressHeaders: ["x-vercel-forwarded-for", "x-forwarded-for"],

      // For AWS/Generic
      // ipAddressHeaders: ["x-forwarded-for"],
    },
  },
  experimental: {
    joins: true,
  },
})
