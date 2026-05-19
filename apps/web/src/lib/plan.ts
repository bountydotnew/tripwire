import { autumn } from "@tripwire/auth/autumn"

const PLAN_CACHE_TTL_MS = 5 * 60 * 1000

const planCache = new Map<string, { planId: string; expiresAt: number }>()

export async function getUserPlanId(userId: string): Promise<string> {
  const cached = planCache.get(userId)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.planId
  }

  try {
    const customer = await autumn.customers.getOrCreate({ customerId: userId })
    const subscriptions = (
      customer as { subscriptions?: Array<{ status: string; planId: string }> }
    )?.subscriptions
    const subscription = subscriptions?.find((s) => s.status === "active")
    const planId = subscription?.planId ?? "free"
    planCache.set(userId, { planId, expiresAt: Date.now() + PLAN_CACHE_TTL_MS })
    return planId
  } catch {
    return "free"
  }
}
