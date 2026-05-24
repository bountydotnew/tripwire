import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { useTRPC } from "#/integrations/trpc/react"
import { Button } from "@tripwire/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@tripwire/ui/dialog"
import { toastManager } from "@tripwire/ui/toast"
import { toastFromError } from "#/lib/toast-error"
import { getActionBadgeProps } from "#/lib/rules/custom-utils"
import { formatRelativeTime } from "#/lib/format"
import type { CustomRuleAction } from "@tripwire/db"

interface CustomRulesTabProps {
  repoId: string
  orgHandle: string
}

export function CustomRulesTab({ repoId, orgHandle }: CustomRulesTabProps) {
  const trpc = useTRPC()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
  } | null>(null)

  const rulesQuery = useQuery(
    trpc.customRules.list.queryOptions({ repoId }, { staleTime: 30_000 })
  )

  const limitsQuery = useQuery(
    trpc.customRules.limits.queryOptions(undefined, { staleTime: 5 * 60_000 })
  )

  const enableMutation = useMutation(
    trpc.customRules.enable.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.customRules.list.queryKey({ repoId }),
        })
      },
      onError: (err) =>
        toastFromError(err, { fallbackTitle: "Failed to toggle rule" }),
    })
  )

  const deleteMutation = useMutation(
    trpc.customRules.delete.mutationOptions({
      onSuccess: () => {
        toastManager.add({ title: "Custom rule deleted", type: "success" })
        queryClient.invalidateQueries({
          queryKey: trpc.customRules.list.queryKey({ repoId }),
        })
        setDeleteTarget(null)
      },
      onError: (err) => {
        toastFromError(err, { fallbackTitle: "Failed to delete rule" })
        setDeleteTarget(null)
      },
    })
  )

  const rules = rulesQuery.data ?? []
  const limits = limitsQuery.data
  const atLimit = limits ? rules.length >= limits.maxRules : false

  const prefetchRuleEditor = (id: string) => {
    void queryClient.prefetchQuery({
      ...trpc.customRules.get.queryOptions({ id }),
      staleTime: 60_000,
    })
  }

  if (rulesQuery.isPending) {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-[88px] animate-pulse rounded-xl bg-tw-card"
          />
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {limits && (
        <div className="flex items-center justify-between">
          <span className="text-[13px] text-tw-text-secondary">
            {rules.length} of {limits.maxRules} custom rules
            <span className="ml-1 text-[#FFFFFF59]">
              (
              {limits.planId === "free"
                ? "Free"
                : limits.planId.charAt(0).toUpperCase() +
                  limits.planId.slice(1)}
              )
            </span>
          </span>
          {atLimit && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => navigate({ href: "/settings/billing" })}
              className="cursor-pointer border-none bg-transparent text-[12px] text-tw-accent hover:underline"
            >
              Upgrade for more
            </Button>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="m-0 text-[13px] text-tw-text-secondary">
          Custom rules built with the visual rule builder.
        </p>
        <Button
          size="sm"
          onClick={() => navigate({ href: `/${orgHandle}/rules/custom/new` })}
          disabled={atLimit}
          className="text-[12px]"
        >
          + Create Rule
        </Button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-tw-border-card bg-tw-card p-8 text-center">
          <p className="m-0 mb-1 text-[15px] font-medium text-white">
            No custom rules yet
          </p>
          <p className="m-0 mb-4 text-[13px] text-[#FFFFFF73]">
            Create rules with conditions and logic gates to build custom
            detection flows.
          </p>
          <Button
            size="sm"
            onClick={() => navigate({ href: `/${orgHandle}/rules/custom/new` })}
            className="text-[12px]"
          >
            Create your first rule
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => {
            const badge = getActionBadgeProps(rule.action as CustomRuleAction)
            return (
              <div
                key={rule.id}
                className="flex flex-col gap-3 rounded-xl border border-tw-border-card bg-tw-card p-4"
                onMouseEnter={() => prefetchRuleEditor(rule.id)}
                onFocusCapture={() => prefetchRuleEditor(rule.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-[14px] font-medium text-white">
                        {rule.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium tracking-wide uppercase ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                    {rule.description && (
                      <p className="m-0 line-clamp-1 text-[12px] text-[#FFFFFF73]">
                        {rule.description}
                      </p>
                    )}
                  </div>

                  <Button
                    variant="ghost"
                    type="button"
                    role="switch"
                    aria-checked={rule.enabled}
                    onClick={() =>
                      enableMutation.mutate({
                        id: rule.id,
                        enabled: !rule.enabled,
                      })
                    }
                    disabled={enableMutation.isPending}
                    className={`relative h-[22px] w-10 shrink-0 cursor-pointer rounded-[11px] border-none transition-colors ${
                      rule.enabled ? "bg-tw-accent" : "bg-[#FFFFFF14]"
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 h-[18px] w-[18px] rounded-[9px] transition-all ${
                        rule.enabled
                          ? "right-0.5 bg-white"
                          : "left-0.5 bg-[#FFFFFF59]"
                      }`}
                    />
                  </Button>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-[11px] text-[#FFFFFF59]">
                    <span>
                      {rule.nodeCount} node{rule.nodeCount !== 1 ? "s" : ""}
                    </span>
                    {rule.simulatedAt && (
                      <span>Simulated {formatRelativeTime(rule.simulatedAt)}</span>
                    )}
                    {!rule.simulatedAt && (
                      <span className="text-amber-300/70">Not simulated</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        navigate({
                          href: `/${orgHandle}/rules/custom/${rule.id}`,
                        })
                      }
                      className="cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[12px] text-[#FFFFFF99] transition-colors hover:bg-[#ffffff08] hover:text-white"
                    >
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() =>
                        setDeleteTarget({ id: rule.id, name: rule.name })
                      }
                      className="cursor-pointer rounded-md border-none bg-transparent px-2 py-1 text-[12px] text-[#FFFFFF59] transition-colors hover:bg-[#ffffff08] hover:text-red-400"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-[360px] border-transparent bg-tw-card p-0"
        >
          <DialogHeader className="px-5 py-4">
            <DialogTitle className="text-[15px] leading-5 font-medium text-tw-text-primary">
              Delete custom rule?
            </DialogTitle>
            <DialogDescription className="text-[13px] leading-5 text-tw-text-secondary">
              "{deleteTarget?.name}" will be permanently removed. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter
            className="gap-1.5 border-t border-white/[0.05] bg-transparent px-2 py-2"
            variant="default"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteTarget(null)}
              className="h-8 rounded-[10px] px-3 text-[12px] text-tw-text-tertiary hover:bg-tw-hover hover:text-tw-text-secondary"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate({ id: deleteTarget.id })
                }
              }}
              className="h-8 rounded-[10px] px-3 text-[12px]"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
