import { lazy, Suspense } from "react"
import { Button } from "#/components/ui/button"
import { createFileRoute, useNavigate } from "@tanstack/react-router"
import { useQuery } from "@tanstack/react-query"
import { useWorkspace } from "#/lib/workspace-context"
import { useTRPC } from "#/integrations/trpc/react"
import type {
  CustomRuleDefinition,
  CustomRuleAction,
  CustomRuleScopeOverride,
} from "@tripwire/db"
import { ChevronLeftStrokeIcon14 } from "#/components/icons/app-chrome-icons"

const RuleBuilderEditor = lazy(() =>
  import("#/components/rules/rule-builder-editor").then((m) => ({
    default: m.RuleBuilderEditor,
  }))
)

export const Route = createFileRoute("/_app/$orgHandle/rules/custom/$ruleId")({
  component: RuleBuilderPage,
})

function EditorSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center bg-tw-bg">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
    </div>
  )
}

function RuleBuilderPage() {
  const { ruleId, orgHandle } = Route.useParams()
  const trpc = useTRPC()
  const navigate = useNavigate()
  const { repo } = useWorkspace()
  const isNew = ruleId === "new"

  const ruleQuery = useQuery(
    trpc.customRules.get.queryOptions(
      { id: ruleId },
      {
        enabled: !isNew,
        staleTime: 60_000,
      }
    )
  )

  if (!repo?.id) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-tw-text-muted">
          Select a repository first.
        </span>
      </div>
    )
  }

  if (!isNew && ruleQuery.isPending) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-tw-text-muted">Loading...</span>
      </div>
    )
  }

  if (!isNew && !ruleQuery.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-tw-text-muted">Rule not found.</span>
      </div>
    )
  }

  const rule = ruleQuery.data

  const initialRule = rule
    ? {
        id: rule.id,
        name: rule.name,
        description: rule.description,
        definition: rule.definition as CustomRuleDefinition,
        action: rule.action as CustomRuleAction,
        thresholdCount: rule.thresholdCount,
        scopeOverride: rule.scopeOverride as CustomRuleScopeOverride | null,
      }
    : undefined

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-tw-border px-4 py-3">
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate({ href: `/${orgHandle}/rules/custom` })}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-tw-hover"
        >
          <ChevronLeftStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-medium text-tw-text-primary">
            {isNew ? "New Custom Rule" : (rule?.name ?? "Edit Rule")}
          </span>
          <span className="truncate text-[11px] text-tw-text-muted">
            {isNew
              ? "Build a custom moderation rule"
              : "Edit rule definition and settings"}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense fallback={<EditorSkeleton />}>
          <RuleBuilderEditor
            repoId={repo.id}
            initialRule={initialRule}
            onSaved={() => navigate({ href: `/${orgHandle}/rules/custom` })}
          />
        </Suspense>
      </div>
    </div>
  )
}
