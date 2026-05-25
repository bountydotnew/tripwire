import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { ChevronLeftStrokeIcon14 } from "@tripwire/ui/icons/app-chrome-icons"
import type { Edge, Node } from "@xyflow/react"
import { WorkflowEditor } from "#/components/layout/app/automations/workflow-editor"
import { templates } from "#/constants/automation-templates"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"

const routeApi = getRouteApi("/_app/$orgHandle/automations/preview")

export function TemplatePreviewPage() {
  const { orgHandle } = routeApi.useParams()
  const { template: templateId } = routeApi.useSearch()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { repo } = useWorkspace()

  const template = templates.find((t) => t.id === templateId)
  const createWf = useMutation(trpc.workflows.create.mutationOptions())

  const handleSaveToWorkflows = (nodes: Node[], edges: Edge[]) => {
    if (!repo?.id || !template) return
    createWf.mutate(
      {
        repoId: repo.id,
        name: template.name,
        definition: {
          nodes: nodes.map((n) => ({
            id: n.id,
            type: n.type as string,
            position: n.position,
            data: n.data as Record<string, unknown>,
          })),
          edges: edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle,
            targetHandle: e.targetHandle,
            label: typeof e.label === "string" ? e.label : undefined,
            animated: e.animated,
          })),
        },
      },
      {
        onSuccess: (wf) => {
          if (repo?.id) {
            queryClient.invalidateQueries({
              queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
            })
          }
          navigate({ to: `/${orgHandle}/automations/${wf.id}` })
        },
      },
    )
  }

  if (!template) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-tw-text-muted">Template not found.</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-tw-border px-4 py-3">
        <Button
          variant="ghost"
          type="button"
          onClick={() => navigate({ to: `/${orgHandle}/automations` })}
          className="flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-tw-hover"
        >
          <ChevronLeftStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-[14px] font-medium text-tw-text-primary">
              {template.name}
            </span>
            <span className="truncate text-[11px] text-tw-text-muted">
              {template.description}
            </span>
          </div>
        </div>
        <span className="rounded-md bg-tw-warning/10 px-2 py-0.5 text-[11px] font-medium text-tw-warning">
          Preview
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <WorkflowEditor
          initialNodes={template.nodes}
          initialEdges={template.edges}
          onSave={handleSaveToWorkflows}
          saveLabel="Save to Workflows"
          repoId={repo?.id}
        />
      </div>
    </div>
  )
}
