import { eq } from "drizzle-orm"
import { autumn } from "@tripwire/auth/autumn"
import { db } from "@tripwire/db/client"
import { organization as baOrganization } from "@tripwire/db"

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

const planCache = new Map<string, { planId: string; expiresAt: number }>()

type OrgMetadata = {
  isPersonal?: boolean
  personalForUserId?: string
}

/**
 * Parse the JSON `metadata` column on the `organization` table. Better
 * Auth's org plugin stores it as a JSON string — we coerce to a typed
 * shape so the grandfather check below is type-safe.
 */
function parseOrgMetadata(value: unknown): OrgMetadata {
  if (value == null) return {}
  if (typeof value === "object") return value as OrgMetadata
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as OrgMetadata
    } catch {
      return {}
    }
  }
  return {}
}

type AutumnSubscription = { status: string; planId: string }

/**
 * Check whether an Autumn customer has an active Pro subscription.
 * Used twice: once for the org's own customer, once for the user's
 * legacy customer when we grandfather a personal workspace.
 */
async function hasActiveProSubscription(customerId: string): Promise<boolean> {
  try {
    // `getOrCreate` is idempotent — if the legacy user-level customer
    // already exists (the common case), we read it. If it doesn't (a
    // user who signed up post-flip), Autumn creates an empty one that
    // won't have Pro anyway, so the grandfather check fails harmlessly.
    const customer = await autumn.customers.getOrCreate({ customerId })
    const subs = (customer as { subscriptions?: AutumnSubscription[] })
      ?.subscriptions
    return Boolean(
      subs?.some((s) => s.status === "active" && s.planId === "pro")
    )
  } catch {
    return false
  }
}

/**
 * Resolve the active plan ID for an organization. Auto-created
 * personal workspaces inherit a legacy user-level Pro subscription
 * forever — that's the deal we made when flipping Autumn from
 * `customerScope: "user"` to `"organization"`. Other orgs use their
 * own org-keyed Autumn customer.
 *
 * Cached for 5 minutes to avoid hammering Autumn on every request.
 */
export async function getOrgPlanId(orgId: string): Promise<string> {
  const cached = planCache.get(orgId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.planId
  }

  const [orgRow] = await db
    .select({ metadata: baOrganization.metadata })
    .from(baOrganization)
    .where(eq(baOrganization.id, orgId))
    .limit(1)

  const meta = parseOrgMetadata(orgRow?.metadata)

  // Grandfather: a personal workspace inherits its owner's legacy
  // user-level Pro subscription (back when Autumn was customer-keyed
  // to user.id). We check the legacy customer first; on hit we cache
  // the result and never look at the org's own Autumn customer.
  if (meta.isPersonal && meta.personalForUserId) {
    const hasLegacyPro = await hasActiveProSubscription(meta.personalForUserId)
    if (hasLegacyPro) {
      planCache.set(orgId, {
        planId: "pro",
        expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
      })
      return "pro"
    }
  }

  // Normal path: ask Autumn for the org's own customer/subscription.
  try {
    const customer = await autumn.customers.getOrCreate({ customerId: orgId })
    const subs = (customer as { subscriptions?: AutumnSubscription[] })
      ?.subscriptions
    const active = subs?.find((s) => s.status === "active")
    const planId = active?.planId ?? "free"
    planCache.set(orgId, {
      planId,
      expiresAt: Date.now() + PLAN_CACHE_TTL_MS,
    })
    return planId
  } catch {
    return "free"
  }
}
