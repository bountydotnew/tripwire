import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "#/components/ui/button"
import { toastFromError } from "#/lib/toast-error"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Edge,
  type Node,
  type ReactFlowInstance,
  BackgroundVariant,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import { nodeTypes, nodeColors } from "#/components/automations/node-types"
import { onRuleMutation } from "#/lib/workflow-events"
import { buildChangeSummary, type EditorSnapshot } from "#/lib/pending-changes"
import { PendingChangesToolbar } from "#/components/automations/pending-changes-toolbar"
import {
  ToolboxSearchLoupeIcon13,
  DragHandleDotsIcon8,
} from "#/components/icons/app-chrome-icons"
import type {
  CustomRuleAction,
  CustomRuleDefinition,
  CustomRuleScopeOverride,
} from "@tripwire/db"

interface PaletteItem {
  type: string
  label: string
  sublabel: string
  color: string
  data: Record<string, unknown>
}

const rulePaletteGroups: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Conditions",
    items: [
      {
        type: "condition",
        label: "Signal Condition",
        sublabel: "Check any signal",
        color: nodeColors.condition,
        data: { signalMode: true, signal: "", operator: "", value: "" },
      },
    ],
  },
  {
    title: "Logic Gates",
    items: [
      {
        type: "logic",
        label: "AND",
        sublabel: "All inputs must pass",
        color: nodeColors.logic,
        data: { gate: "AND" },
      },
      {
        type: "logic",
        label: "OR",
        sublabel: "Any input can pass",
        color: nodeColors.logic,
        data: { gate: "OR" },
      },
      {
        type: "logic",
        label: "NOT",
        sublabel: "Invert the result",
        color: nodeColors.logic,
        data: { gate: "NOT" },
      },
    ],
  },
  {
    title: "Transform",
    items: [
      {
        type: "transform",
        label: "Fetch GitHub User",
        sublabel: "Enrich with profile data",
        color: nodeColors.transform,
        data: { transform: "fetch_github_user" },
      },
      {
        type: "transform",
        label: "Compute Score",
        sublabel: "Calculate contributor score",
        color: nodeColors.transform,
        data: { transform: "compute_score" },
      },
      {
        type: "transform",
        label: "Fetch PR Files",
        sublabel: "Get changed file list",
        color: nodeColors.transform,
        data: { transform: "fetch_pr_files" },
      },
      {
        type: "transform",
        label: "Scan History",
        sublabel: "Check repo history for user",
        color: nodeColors.transform,
        data: { transform: "scan_history" },
      },
      {
        type: "transform",
        label: "Detect Language",
        sublabel: "Analyze content language",
        color: nodeColors.transform,
        data: { transform: "detect_language" },
      },
    ],
  },
]

interface SimulationResult {
  totalContributors: number
  wouldBlock: number
  wouldPass: number
  wouldNearMiss: number
  blockPercentage: number
  contributors: Array<{
    username: string
    avatarUrl: string | null
    passed: boolean
    nearMiss: boolean
    detail: string
  }>
}

interface RuleBuilderEditorProps {
  repoId: string
  initialRule?: {
    id: string
    name: string
    description: string | null
    definition: CustomRuleDefinition
    action: CustomRuleAction
    thresholdCount: number | null
    scopeOverride: CustomRuleScopeOverride | null
  }
  onSaved?: (ruleId: string) => void
}

const getId = () =>
  `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export function RuleBuilderEditor({
  repoId,
  initialRule,
  onSaved,
}: RuleBuilderEditorProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const isEditMode = !!initialRule?.id

  const initialNodes: Node[] =
    initialRule?.definition.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: n.data,
    })) ?? []

  const initialEdges: Edge[] =
    initialRule?.definition.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? undefined,
      targetHandle: e.targetHandle ?? undefined,
      animated: e.animated,
    })) ?? []

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [outputNodeId, setOutputNodeId] = useState(
    initialRule?.definition.outputNodeId ?? ""
  )

  const [name, setName] = useState(initialRule?.name ?? "")
  const [description, setDescription] = useState(initialRule?.description ?? "")
  const [action, setAction] = useState<CustomRuleAction>(
    initialRule?.action ?? "log"
  )
  const [thresholdCount, setThresholdCount] = useState<number>(
    initialRule?.thresholdCount ?? 3
  )
  const [scopePR, setScopePR] = useState(
    initialRule?.scopeOverride?.pullRequests ?? true
  )
  const [scopeIssues, setScopeIssues] = useState(
    initialRule?.scopeOverride?.issues ?? false
  )
  const [scopeComments, setScopeComments] = useState(
    initialRule?.scopeOverride?.comments ?? false
  )

  const [search, setSearch] = useState("")
  const [simResult, setSimResult] = useState<SimulationResult | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [showMiniMap, setShowMiniMap] = useState(false)

  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)

  const createRule = useMutation(trpc.customRules.create.mutationOptions())
  const updateRule = useMutation(trpc.customRules.update.mutationOptions())
  const simulateRule = useMutation(trpc.customRules.simulate.mutationOptions())

  const [pendingChangeSummary, setPendingChangeSummary] = useState<
    string | null
  >(null)
  const preChangeSnapshot = useRef<EditorSnapshot | null>(null)

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setShowMiniMap(true))
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (!initialRule?.id) return
    const ruleId = initialRule.id
    return onRuleMutation((mutatedId) => {
      if (mutatedId !== ruleId) return
      preChangeSnapshot.current = {
        nodes: nodesRef.current.map((n) => ({ ...n })),
        edges: edgesRef.current.map((e) => ({ ...e })),
      }
      queryClient
        .fetchQuery({
          ...trpc.customRules.get.queryOptions({ id: ruleId }),
          staleTime: 60_000,
        })
        .then((rule) => {
          if (!rule) return
          const def = rule.definition as CustomRuleDefinition
          const before: EditorSnapshot = preChangeSnapshot.current ?? {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }
          const afterNodes: Node[] = def.nodes.map((n) => ({
            id: n.id,
            type: n.type,
            position: n.position,
            data: n.data,
          }))
          const afterEdges: Edge[] = def.edges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            sourceHandle: e.sourceHandle ?? undefined,
            targetHandle: e.targetHandle ?? undefined,
            animated: e.animated,
          }))
          const after: EditorSnapshot = { nodes: afterNodes, edges: afterEdges }
          const summary = buildChangeSummary(before, after)
          setNodes(afterNodes)
          setEdges(afterEdges)
          if (def.outputNodeId) setOutputNodeId(def.outputNodeId)
          setPendingChangeSummary(summary)
        })
        .catch(() => {})
    })
  }, [initialRule?.id, trpc, queryClient, setNodes, setEdges])

  const handleAcceptChanges = () => {
    setPendingChangeSummary(null)
    preChangeSnapshot.current = null
  }

  const handleRevertChanges = () => {
    if (preChangeSnapshot.current) {
      setNodes(preChangeSnapshot.current.nodes)
      setEdges(preChangeSnapshot.current.edges)
    }
    setPendingChangeSummary(null)
    preChangeSnapshot.current = null
  }

  const buildDefinition = (): CustomRuleDefinition => {
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        type: n.type as "condition" | "logic" | "transform",
        position: n.position,
        data: n.data as Record<string, unknown>,
      })),
      edges: edges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle,
        targetHandle: e.targetHandle,
        animated: e.animated,
      })),
      outputNodeId,
    }
  }

  const onConnect = useCallback(
    (params: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: "#27272A", strokeWidth: 1.5 },
          },
          eds
        )
      )
    },
    [setEdges]
  )

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = "move"
  }

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const type = e.dataTransfer.getData("application/reactflow-type")
      const dataStr = e.dataTransfer.getData("application/reactflow-data")
      if (!type || !rfInstance || !reactFlowWrapper.current) return
      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })
      const newId = getId()
      setNodes((nds) => [
        ...nds,
        {
          id: newId,
          type,
          position,
          data: dataStr ? JSON.parse(dataStr) : {},
        },
      ])
      if (!outputNodeId) {
        setOutputNodeId(newId)
      }
    },
    [rfInstance, setNodes, outputNodeId]
  )

  const displayNodes = nodes.map((n) => {
    if (n.id === outputNodeId) {
      return {
        ...n,
        style: {
          ...(n.style ?? {}),
          boxShadow: "0 0 0 2px #34A6FF",
          borderRadius: "12px",
        },
      }
    }
    return n
  })

  const handleSimulate = async () => {
    setSaveError(null)
    const definition = buildDefinition()
    if (definition.nodes.length === 0) {
      setSaveError("Add at least one node before simulating.")
      return
    }
    if (!definition.outputNodeId) {
      setSaveError("Set an output node before simulating.")
      return
    }
    try {
      const result = await simulateRule.mutateAsync({
        repoId,
        definition,
      })
      setSimResult(result)
    } catch (err: unknown) {
      toastFromError(err, { fallbackTitle: "Something went wrong" })
    }
  }

  const handleSave = async () => {
    setSaveError(null)
    if (!name.trim()) {
      setSaveError("Rule name is required.")
      return
    }
    const definition = buildDefinition()
    if (definition.nodes.length === 0) {
      setSaveError("Add at least one node.")
      return
    }
    if (!definition.outputNodeId) {
      setSaveError("Set an output node.")
      return
    }
    if (!definition.nodes.some((n) => n.id === definition.outputNodeId)) {
      setSaveError("Output node must reference an existing node.")
      return
    }

    const scopeOverride: CustomRuleScopeOverride = {
      pullRequests: scopePR,
      issues: scopeIssues,
      comments: scopeComments,
    }

    try {
      if (isEditMode) {
        const updated = await updateRule.mutateAsync({
          id: initialRule!.id,
          name: name.trim(),
          description: description.trim() || null,
          definition,
          action,
          thresholdCount: action === "threshold" ? thresholdCount : null,
          scopeOverride,
        })
        onSaved?.(updated.id)
      } else {
        const created = await createRule.mutateAsync({
          repoId,
          name: name.trim(),
          description: description.trim() || null,
          definition,
          action,
          thresholdCount: action === "threshold" ? thresholdCount : null,
          scopeOverride,
        })
        onSaved?.(created.id)
      }
    } catch (err: unknown) {
      toastFromError(err, { fallbackTitle: "Something went wrong" })
    }
  }

  const filtered = search.trim()
    ? (() => {
        const q = search.toLowerCase()
        return rulePaletteGroups
          .map((g) => ({
            ...g,
            items: g.items.filter(
              (i) =>
                i.label.toLowerCase().includes(q) ||
                i.sublabel.toLowerCase().includes(q)
            ),
          }))
          .filter((g) => g.items.length > 0)
      })()
    : rulePaletteGroups

  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/reactflow-type", item.type)
    e.dataTransfer.setData(
      "application/reactflow-data",
      JSON.stringify(item.data)
    )
    e.dataTransfer.effectAllowed = "move"
  }

  const isSaving = createRule.isPending || updateRule.isPending

  return (
    <div className="flex h-full w-full">
      {/* Left palette */}
      <div className="flex w-[220px] shrink-0 flex-col border-r border-tw-border bg-tw-surface">
        <div className="shrink-0 border-b border-tw-border p-2">
          <div className="flex h-8 items-center gap-2 rounded-[10px] bg-tw-card px-2.5">
            <ToolboxSearchLoupeIcon13 />
            <input
              type="text"
              placeholder="Search nodes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto p-1.5">
          {filtered.map((group) => (
            <div key={group.title} className="mb-3">
              <div className="mb-1.5 px-2 text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
                {group.title}
              </div>
              <div className="flex flex-col gap-px rounded-[10px] bg-tw-card p-1">
                {group.items.map((item) => (
                  <div
                    key={`${item.type}-${item.label}`}
                    draggable
                    onDragStart={(e) => onDragStart(e, item)}
                    className="flex cursor-grab items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-tw-hover active:cursor-grabbing"
                  >
                    <span className="shrink-0 text-tw-text-muted opacity-60">
                      <DragHandleDotsIcon8 />
                    </span>
                    <span className="truncate text-[12px] leading-tight text-tw-text-primary">
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Canvas */}
      <div className="relative flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={displayNodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "#27272A", strokeWidth: 1.5 },
          }}
          className="!bg-tw-bg"
          onNodeContextMenu={(e, node) => {
            e.preventDefault()
            setOutputNodeId(node.id)
          }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#FFFFFF08"
          />
          <Controls className="!rounded-lg !border-tw-border !bg-tw-card [&>button]:!border-tw-border [&>button]:!bg-tw-card [&>button]:!text-tw-text-muted [&>button:hover]:!bg-tw-hover" />
          {showMiniMap && (
            <MiniMap
              nodeColor={(n) => {
                if (n.id === outputNodeId) return "#34A6FF"
                return (
                  nodeColors[n.type as keyof typeof nodeColors] ?? "#9F9FA9"
                )
              }}
              maskColor="#0D0D0F99"
              className="!rounded-lg !border-tw-border !bg-tw-surface"
            />
          )}
        </ReactFlow>

        {outputNodeId && (
          <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-tw-border bg-tw-card/90 px-2.5 py-1.5 text-[11px] text-tw-text-secondary">
            <span className="h-2 w-2 rounded-full bg-[#34A6FF]" />
            Output node set (right-click to change)
          </div>
        )}

        {pendingChangeSummary && (
          <PendingChangesToolbar
            summary={pendingChangeSummary}
            onAccept={handleAcceptChanges}
            onCancel={handleRevertChanges}
          />
        )}
      </div>

      {/* Right config panel */}
      <div className="flex w-[280px] shrink-0 flex-col overflow-auto border-l border-tw-border bg-tw-surface">
        <div className="flex flex-col gap-3 px-3 pt-3 pb-2">
          <div className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
            Rule Config
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-tw-text-tertiary">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Suspicious newcomer"
              className="h-8 rounded-[10px] border border-transparent bg-tw-card px-2.5 text-[13px] text-white outline-none placeholder:text-[#6E6E6E] focus:border-tw-accent/40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-tw-text-tertiary">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description"
              className="h-8 rounded-[10px] border border-transparent bg-tw-card px-2.5 text-[13px] text-white outline-none placeholder:text-[#6E6E6E] focus:border-tw-accent/40"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-tw-text-tertiary">Action</label>
            <div className="flex items-center gap-1 rounded-[10px] bg-tw-card p-1">
              {(
                [
                  ["block", "Block"],
                  ["warn", "Warn"],
                  ["log", "Log"],
                  ["threshold", "Threshold"],
                ] as const
              ).map(([val, label]) => (
                <Button
                  variant="ghost"
                  key={val}
                  type="button"
                  onClick={() => setAction(val)}
                  className={`flex h-7 flex-1 cursor-pointer items-center justify-center rounded-[6px] px-1.5 text-[12px] font-medium transition-colors ${
                    action === val
                      ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                      : "text-[#9F9FA9] hover:text-[#EEEEEE]"
                  }`}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {action === "threshold" && (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] text-tw-text-tertiary">
                Threshold count
              </label>
              <input
                type="number"
                min={1}
                value={thresholdCount}
                onChange={(e) =>
                  setThresholdCount(Math.max(1, parseInt(e.target.value) || 1))
                }
                className="h-8 w-20 rounded-[10px] border border-transparent bg-tw-card px-2.5 text-[13px] text-white outline-none focus:border-tw-accent/40"
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <span className="text-[11px] text-tw-text-tertiary">
              Scope override
            </span>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-tw-text-secondary">
              <input
                type="checkbox"
                checked={scopePR}
                onChange={(e) => setScopePR(e.target.checked)}
                className="accent-tw-accent"
              />
              Pull requests
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-tw-text-secondary">
              <input
                type="checkbox"
                checked={scopeIssues}
                onChange={(e) => setScopeIssues(e.target.checked)}
                className="accent-tw-accent"
              />
              Issues
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-tw-text-secondary">
              <input
                type="checkbox"
                checked={scopeComments}
                onChange={(e) => setScopeComments(e.target.checked)}
                className="accent-tw-accent"
              />
              Comments
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-t border-tw-border px-3 py-2.5">
          <div className="text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
            Impact Preview
          </div>
          <Button
            variant="ghost"
            type="button"
            onClick={handleSimulate}
            disabled={simulateRule.isPending || nodes.length === 0}
            className="flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] bg-[#363639] text-[13px] font-medium text-tw-text-primary transition-colors hover:bg-[#404044] disabled:opacity-50"
          >
            {simulateRule.isPending ? "Simulating..." : "Run Simulation"}
          </Button>

          {simResult && (
            <div className="mt-1 flex flex-col gap-2">
              <div className="grid grid-cols-3 gap-1.5">
                <div className="rounded-md bg-tw-card px-2 py-1.5 text-center">
                  <div className="text-[12px] font-medium text-tw-text-primary tabular-nums">
                    {simResult.totalContributors}
                  </div>
                  <div className="text-[10px] text-tw-text-tertiary">Total</div>
                </div>
                <div className="rounded-md bg-tw-card px-2 py-1.5 text-center">
                  <div className="text-[12px] font-medium text-tw-error tabular-nums">
                    {simResult.wouldBlock}
                  </div>
                  <div className="text-[10px] text-tw-text-tertiary">Block</div>
                </div>
                <div className="rounded-md bg-tw-card px-2 py-1.5 text-center">
                  <div className="text-[12px] font-medium text-tw-success tabular-nums">
                    {simResult.wouldPass}
                  </div>
                  <div className="text-[10px] text-tw-text-tertiary">Pass</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-tw-card">
                  <div
                    className={`h-full rounded-full transition-all ${
                      simResult.blockPercentage > 50
                        ? "bg-tw-error"
                        : simResult.blockPercentage > 20
                          ? "bg-tw-warning"
                          : "bg-tw-success"
                    }`}
                    style={{
                      width: `${simResult.blockPercentage}%`,
                    }}
                  />
                </div>
                <span className="text-[11px] text-tw-text-secondary tabular-nums">
                  {simResult.blockPercentage}% blocked
                </span>
              </div>

              {simResult.blockPercentage > 50 && (
                <p className="m-0 text-[11px] text-tw-warning">
                  This rule would block more than half of recent contributors.
                </p>
              )}

              {simResult.contributors.length > 0 && (
                <div className="flex max-h-[200px] flex-col gap-0.5 overflow-auto">
                  {simResult.contributors.map((c) => (
                    <div
                      key={c.username}
                      className="flex items-center gap-2 rounded-lg bg-tw-inner px-2 py-1.5"
                    >
                      {c.avatarUrl && (
                        <img
                          src={c.avatarUrl}
                          alt=""
                          className="size-5 rounded-full"
                        />
                      )}
                      <span className="flex-1 truncate text-[12px] text-tw-text-secondary">
                        {c.username}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          c.passed
                            ? c.nearMiss
                              ? "bg-tw-warning/10 text-tw-warning"
                              : "bg-tw-success/10 text-tw-success"
                            : "bg-tw-error/10 text-tw-error"
                        }`}
                      >
                        {c.passed
                          ? c.nearMiss
                            ? "Near miss"
                            : "Pass"
                          : "Block"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {saveError && (
          <div className="px-3">
            <p className="m-0 text-[11px] text-tw-error">{saveError}</p>
          </div>
        )}

        <div className="mt-auto border-t border-tw-border px-3 py-2.5">
          <Button
            variant="ghost"
            type="button"
            onClick={handleSave}
            disabled={isSaving || !name.trim()}
            className="flex h-9 w-full items-center justify-center gap-1.5 rounded-[10px] bg-tw-accent text-[13px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {isSaving
              ? "Saving..."
              : isEditMode
                ? "Update Rule"
                : "Create Rule"}
          </Button>
        </div>
      </div>
    </div>
  )
}
