import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useWorkspace } from "#/lib/workspace-context";
import { useTRPC } from "#/integrations/trpc/react";
import { WorkflowEditor } from "#/components/automations/workflow-editor";
import type { Node, Edge } from "@xyflow/react";

export const Route = createFileRoute("/_app/$orgHandle/automations/$automationId")({
	component: AutomationEditorPage,
});

function AutomationEditorPage() {
	const { automationId, orgHandle } = Route.useParams();
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { repo } = useWorkspace();

	const wfQuery = useQuery(
		trpc.workflows.get.queryOptions(
			{ id: automationId },
			{ enabled: !!automationId },
		),
	);

	const updateWf = useMutation(trpc.workflows.update.mutationOptions());

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
						queryClient.invalidateQueries({ queryKey: trpc.workflows.list.queryKey({ repoId: repo.id }) });
					}
				},
			},
		);
	};

	if (wfQuery.isPending) {
		return (
			<div className="flex items-center justify-center h-full">
				<span className="text-tw-text-muted text-sm">Loading...</span>
			</div>
		);
	}

	if (!wfQuery.data) {
		return (
			<div className="flex items-center justify-center h-full">
				<span className="text-tw-text-muted text-sm">Workflow not found.</span>
			</div>
		);
	}

	const wf = wfQuery.data;
	const def = wf.definition as { nodes: Node[]; edges: Edge[] };

	return (
		<div className="h-full flex flex-col">
			<div className="flex items-center gap-3 px-4 py-3 border-b border-tw-border shrink-0">
				<button
					type="button"
					onClick={() => navigate({ to: `/${orgHandle}/automations` })}
					className="flex items-center justify-center size-7 rounded-lg hover:bg-tw-hover transition-colors"
				>
					<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
						<path d="M9 3L5 7L9 11" stroke="#9F9FA9" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
					</svg>
				</button>
				<div className="flex flex-col min-w-0">
					<span className="text-[14px] font-medium text-tw-text-primary truncate">{wf.name}</span>
					{wf.description && (
						<span className="text-[11px] text-tw-text-muted truncate">{wf.description}</span>
					)}
				</div>
				<div className="ml-auto flex items-center gap-2">
					<span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${wf.enabled ? "bg-tw-success/10 text-tw-success" : "bg-[#FFFFFF08] text-tw-text-muted"}`}>
						{wf.enabled ? "Active" : "Draft"}
					</span>
				</div>
			</div>
			<div className="flex-1 min-h-0">
				<WorkflowEditor
					initialNodes={def.nodes as Node[]}
					initialEdges={def.edges as Edge[]}
					onSave={handleSave}
					repoId={repo?.id}
				/>
			</div>
		</div>
	);
}
