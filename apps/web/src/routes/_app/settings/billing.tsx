import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@tripwire/ui/button"
import { useCustomer } from "autumn-js/react"
import { useWorkspace } from "#/providers/workspace-context"
import { PlusStrokeIcon14 } from "@tripwire/ui/icons/app-chrome-icons"

export const Route = createFileRoute("/_app/settings/billing")({
  component: BillingSettingsPage,
})

function BillingSettingsPage() {
  const { data: customer, isLoading } = useCustomer()
  const { repos } = useWorkspace()

  if (isLoading) {
    return <BillingSkeleton />
  }

  // Extract plan info from Autumn customer
  const subscription = customer?.subscriptions?.find(
    (s) =>
      typeof s === "object" &&
      s !== null &&
      "status" in s &&
      (s as { status?: string }).status === "active"
  )
  const planId = subscription?.planId ?? "free"
  const planName = planId === "pro" ? "Pro" : "Free"
  const isFreePlan = planId === "free"

  // AI credits balance
  const aiBalance = customer?.balances?.ai_credits
  const creditsUsed = aiBalance?.usage ?? 0
  const creditsGranted = aiBalance?.granted ?? 0
  const isUnlimited = aiBalance?.unlimited ?? false

  // Usage percentage for progress bar
  const usagePercent =
    creditsGranted > 0 ? Math.min((creditsUsed / creditsGranted) * 100, 100) : 0

  // Price
  const price = isFreePlan ? 0 : 9

  // Repos connected
  const repoCount = repos.length

  return (
    <div className="flex flex-col gap-8">
      {/* Plan */}
      <SettingsSection
        title="Plan"
        description="Your current subscription and usage."
      >
        <div className="rounded-xl bg-tw-card">
          {/* Plan header */}
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold text-tw-text-primary">
                {planName}
              </span>
              <span className="rounded bg-green-400/10 px-1.5 py-0.5 text-[11px] font-medium text-green-400">
                Active
              </span>
            </div>
            {price > 0 && (
              <div className="text-right">
                <span className="text-[20px] font-semibold text-tw-text-primary">
                  ${price}
                </span>
                <span className="ml-1 text-[12px] text-tw-text-muted">
                  per month
                </span>
              </div>
            )}
          </div>

          {/* Usage stats */}
          <div className="grid grid-cols-2 gap-4 border-t border-[#27272A] px-4 pt-3 pb-3">
            <div>
              <div className="mb-1 text-[11px] font-medium tracking-wider text-tw-text-muted uppercase">
                AI Spend
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[18px] font-semibold text-tw-text-primary tabular-nums">
                  ${(creditsUsed / 100).toFixed(2)}
                </span>
                <span className="text-[12px] text-tw-text-muted">
                  /{" "}
                  {isUnlimited
                    ? "Unlimited"
                    : `$${(creditsGranted / 100).toFixed(2)}`}
                </span>
              </div>
              {!isUnlimited && creditsGranted > 0 && (
                <div className="mt-1.5 h-1 w-full rounded-full bg-[#27272A]">
                  <div
                    className="h-1 rounded-full bg-tw-text-primary transition-all"
                    style={{ width: `${usagePercent}%` }}
                  />
                </div>
              )}
            </div>
            <div>
              <div className="mb-1 text-[11px] font-medium tracking-wider text-tw-text-muted uppercase">
                Repos Connected
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-[18px] font-semibold text-tw-text-primary tabular-nums">
                  {repoCount}
                </span>
                <span className="text-[12px] text-tw-text-muted">
                  / Unlimited
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3 px-4 pt-1 pb-4">
            <UpgradeButton isFreePlan={isFreePlan} />
          </div>
        </div>
      </SettingsSection>

      {/* Payment method */}
      <SettingsSection title="Payment method" description="Cards on file.">
        <PaymentMethodSection hasStripe={!!customer?.stripeId} />
      </SettingsSection>
    </div>
  )
}

function UpgradeButton({ isFreePlan }: { isFreePlan: boolean }) {
  const { attach, openCustomerPortal } = useCustomer()

  const handleUpgrade = async () => {
    try {
      await attach({ planId: "pro" })
    } catch (err) {
      console.error("[Billing] Upgrade failed:", err)
    }
  }

  const handleManage = async () => {
    try {
      await openCustomerPortal()
    } catch (err) {
      console.error("[Billing] Portal open failed:", err)
    }
  }

  if (isFreePlan) {
    return (
      <Button
        variant="ghost"
        type="button"
        onClick={handleUpgrade}
        className="flex h-8 items-center rounded-lg bg-tw-text-primary px-3 text-[13px] font-medium text-[#0D0D0F] transition-opacity hover:opacity-90"
      >
        Upgrade plan
      </Button>
    )
  }

  return (
    <Button
      variant="ghost"
      type="button"
      onClick={handleManage}
      className="flex h-8 items-center rounded-lg border border-[#27272A] px-3 text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-tw-hover"
    >
      Manage subscription
    </Button>
  )
}

function PaymentMethodSection({ hasStripe }: { hasStripe: boolean }) {
  const { setupPayment, openCustomerPortal } = useCustomer()

  const handleAddPayment = async () => {
    try {
      await setupPayment()
    } catch (err) {
      console.error("[Billing] Setup payment failed:", err)
    }
  }

  const handleManagePayment = async () => {
    try {
      await openCustomerPortal()
    } catch (err) {
      console.error("[Billing] Portal open failed:", err)
    }
  }

  if (!hasStripe) {
    return (
      <div className="rounded-xl bg-tw-card p-4">
        <div className="flex items-center justify-between">
          <div className="text-[13px] text-tw-text-muted">
            No payment method on file.
          </div>
          <Button
            variant="ghost"
            type="button"
            onClick={handleAddPayment}
            className="flex items-center gap-1 text-[13px] font-medium text-tw-text-secondary transition-colors hover:text-tw-text-primary"
          >
            <PlusStrokeIcon14 className="text-current" />
            Add payment method
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl bg-tw-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-[13px] text-tw-text-muted">
          Managed through Stripe.
        </div>
        <Button
          variant="ghost"
          type="button"
          onClick={handleManagePayment}
          className="text-[13px] font-medium text-tw-text-secondary transition-colors hover:text-tw-text-primary"
        >
          Manage
        </Button>
      </div>
    </div>
  )
}

function BillingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-12 rounded bg-white/5" />
        <div className="h-3 w-48 rounded bg-white/5" />
        <div className="h-[180px] rounded-xl bg-tw-card p-4" />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-4 w-28 rounded bg-white/5" />
        <div className="h-[60px] rounded-xl bg-tw-card p-4" />
      </div>
    </div>
  )
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-[14px] font-semibold text-tw-text-primary">
          {title}
        </h2>
        <p className="mt-0.5 text-[13px] text-tw-text-muted">{description}</p>
      </div>
      {children}
    </div>
  )
}
