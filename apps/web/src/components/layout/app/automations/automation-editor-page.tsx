import { useEffect, useRef, useState } from "react"
import { getRouteApi, useNavigate } from "@tanstack/react-router"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button } from "@tripwire/ui/button"
import { ChevronLeftStrokeIcon14 } from "@tripwire/ui/icons/app-chrome-icons"
import type { Edge, Node } from "@xyflow/react"
import { WorkflowEditor } from "#/components/layout/app/automations/workflow-editor"
import { useTRPC } from "#/integrations/trpc/react"
import { useWorkspace } from "#/providers/workspace-context"

const routeApi = getRouteApi("/_app/$orgHandle/automations/$automationId")

export function AutomationEditorPageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-tw-accent border-t-transparent" />
    </div>
  )
}

export function AutomationEditorPage() {
  const { automationId, orgHandle } = routeApi.useParams()
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { repo } = useWorkspace()

  const wfQuery = useQuery(
    trpc.workflows.get.queryOptions(
      { id: automationId },
      { enabled: !!automationId },
    ),
  )

  const updateWf = useMutation(trpc.workflows.update.mutationOptions())

  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState("")
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [editingName])

  const commitName = () => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== wfQuery.data?.name) {
      updateWf.mutate(
        { id: automationId, name: trimmed },
        {
          onSuccess: () => {
            if (repo?.id) {
              queryClient.invalidateQueries({
                queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
              })
            }
            queryClient.invalidateQueries({
              queryKey: trpc.workflows.get.queryKey({ id: automationId }),
            })
          },
        },
      )
    }
    setEditingName(false)
  }

  const handleSave = (nodes: Node[], edges: Edge[]) => {
    updateWf.mutate(
      {
        id: automationId,
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
        onSuccess: () => {
          if (repo?.id) {
            queryClient.invalidateQueries({
              queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }),
            })
          }
        },
      },
    )
  }

  if (wfQuery.isPending) {
    return <AutomationEditorPageSkeleton />
  }

  if (!wfQuery.data) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-sm text-tw-text-muted">Workflow not found.</span>
      </div>
    )
  }

  const wf = wfQuery.data
  const def = wf.definition as { nodes: Node[]; edges: Edge[] }

  const handleRemoteUpdate = () => {
    wfQuery.refetch()
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-tw-border px-4 py-3">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => navigate({ to: `/${orgHandle}/automations` })}
        >
          <ChevronLeftStrokeIcon14 className="text-[#9F9FA9]" />
        </Button>
        <div className="flex min-w-0 flex-col">
          {editingName ? (
            <input
              ref={nameInputRef}
              type="text"
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  commitName()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  setEditingName(false)
                }
              }}
              className="border-b border-tw-accent bg-transparent px-0 py-0 text-[14px] font-medium text-tw-text-primary outline-none"
            />
          ) : (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => {
                setNameDraft(wf.name)
                setEditingName(true)
              }}
              className="h-auto cursor-text truncate p-0 text-left text-[14px] font-medium text-tw-text-primary hover:text-tw-accent"
            >
              {wf.name}
            </Button>
          )}
          {wf.description && (
            <span className="truncate text-[11px] text-tw-text-muted">
              {wf.description}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${wf.enabled ? "bg-tw-success/10 text-tw-success" : "bg-[#FFFFFF08] text-tw-text-muted"}`}
          >
            {wf.enabled ? "Active" : "Draft"}
          </span>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <WorkflowEditor
          key={wfQuery.dataUpdatedAt}
          initialNodes={def.nodes as Node[]}
          initialEdges={def.edges as Edge[]}
          onSave={handleSave}
          isSaving={updateWf.isPending}
          repoId={repo?.id}
          workflowId={automationId}
          onRemoteUpdate={handleRemoteUpdate}
        />
      </div>
    </div>
  )
}
