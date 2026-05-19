import { useState, useCallback, useRef, useMemo, useEffect } from "react"
import { Button } from "#/components/ui/button"
import { onWorkflowMutation } from "#/lib/workflow-events"
import { buildChangeSummary, type EditorSnapshot } from "#/lib/pending-changes"
import { PendingChangesToolbar } from "#/components/automations/pending-changes-toolbar"
import {
  PlayTriangleIcon13,
  UserCircleMutedIcon13,
} from "#/components/icons/app-chrome-icons"
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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useTRPC } from "#/integrations/trpc/react"
import {
  nodeTypes,
  nodeColors,
  triggerLabels,
  ruleLabels,
  actionLabels,
} from "./node-types"
import {
  simulateWorkflow,
  type SimMode,
  type SimNodeResult,
} from "#/lib/graph-evaluator"
import { collectSimInputs, type SimInput } from "#/lib/sim-context"
import { WorkflowSidebar, type SidebarTab } from "./workflow-sidebar"
import { toastManager } from "#/components/ui/toast"

interface WorkflowEditorProps {
  initialNodes?: Node[]
  initialEdges?: Edge[]
  onSave?: (nodes: Node[], edges: Edge[]) => void
  isSaving?: boolean
  saveLabel?: string
  repoId?: string
  workflowId?: string
  onRemoteUpdate?: () => void
}

const getId = () =>
  `node_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`

export function WorkflowEditor({
  initialNodes = [],
  initialEdges = [],
  onSave,
  isSaving,
  saveLabel,
  repoId,
  workflowId,
  onRemoteUpdate,
}: WorkflowEditorProps) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [search, setSearch] = useState("")
  const [showSim, setShowSim] = useState(false)
  const [simResults, setSimResults] = useState<SimNodeResult[] | null>(null)
  const [simStep, setSimStep] = useState(0)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("toolbox")
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null)
  const initialSnapshot = useRef(
    JSON.stringify({
      n: initialNodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
      e: initialEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
      })),
    })
  )

  const [pendingChangeSummary, setPendingChangeSummary] = useState<
    string | null
  >(null)
  const preChangeSnapshot = useRef<EditorSnapshot | null>(null)

  const isDirty =
    JSON.stringify({
      n: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
      e: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    }) !== initialSnapshot.current

  const nodesRef = useRef(nodes)
  nodesRef.current = nodes
  const edgesRef = useRef(edges)
  edgesRef.current = edges

  useEffect(() => {
    if (!workflowId) return
    return onWorkflowMutation((mutatedId) => {
      if (mutatedId !== workflowId) return
      preChangeSnapshot.current = {
        nodes: nodesRef.current.map((n) => ({ ...n })),
        edges: edgesRef.current.map((e) => ({ ...e })),
      }
      queryClient
        .fetchQuery(trpc.workflows.get.queryOptions({ id: workflowId }))
        .then((wf) => {
          if (!wf) return
          const def = wf.definition as { nodes: Node[]; edges: Edge[] }
          const before: EditorSnapshot = preChangeSnapshot.current ?? {
            nodes: nodesRef.current,
            edges: edgesRef.current,
          }
          const after: EditorSnapshot = { nodes: def.nodes, edges: def.edges }
          const summary = buildChangeSummary(before, after)
          setNodes(def.nodes)
          setEdges(def.edges)
          setPendingChangeSummary(summary)
        })
        .catch(() => {
          onRemoteUpdate?.()
        })
    })
  }, [workflowId, onRemoteUpdate, trpc, queryClient, setNodes, setEdges])

  const handleAcceptChanges = () => {
    setPendingChangeSummary(null)
    preChangeSnapshot.current = null
    initialSnapshot.current = JSON.stringify({
      n: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
      e: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    })
  }

  const handleRevertChanges = () => {
    if (preChangeSnapshot.current) {
      setNodes(preChangeSnapshot.current.nodes)
      setEdges(preChangeSnapshot.current.edges)
    }
    setPendingChangeSummary(null)
    preChangeSnapshot.current = null
  }

  const handleNodeDataChange = useCallback(
    (nodeId: string, data: Record<string, unknown>) => {
      setNodes((nds) => nds.map((n) => (n.id !== nodeId ? n : { ...n, data })))
    },
    [setNodes]
  )

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id)
    setSidebarTab("editor")
  }, [])

  // No-op: keep selectedNodeId so the editor panel stays populated.
  // Selection clears when the user clicks a different node.
  const onPaneClick = () => {}

  const visibleSteps = simResults?.slice(0, simStep) ?? []
  const displayNodes = useMemo(() => {
    if (!simResults || visibleSteps.length === 0) return nodes
    const resultMap = new Map(visibleSteps.map((r) => [r.nodeId, r]))
    const triggerIds = new Set(
      nodes.filter((n) => n.type === "trigger").map((n) => n.id)
    )
    return nodes.map((n) => {
      const r = resultMap.get(n.id)
      const isTrigger = triggerIds.has(n.id) && simStep > 0
      if (!r && !isTrigger) return n
      const status = r?.status ?? "executed"
      const isLatest =
        visibleSteps.length > 0 &&
        visibleSteps[visibleSteps.length - 1]?.nodeId === n.id
      const glowColor =
        status === "pass"
          ? isLatest
            ? "0 0 0 2px #67E19F"
            : "0 0 0 2px #67E19F66"
          : status === "fail"
            ? isLatest
              ? "0 0 0 2px #F56D5D"
              : "0 0 0 2px #F56D5D66"
            : status === "executed"
              ? isLatest
                ? "0 0 0 2px #34A6FF"
                : "0 0 0 2px #34A6FF66"
              : undefined
      return glowColor
        ? {
            ...n,
            style: { ...n.style, boxShadow: glowColor, borderRadius: "12px" },
          }
        : n
    })
  }, [nodes, simResults, visibleSteps, simStep])

  const displayEdges = useMemo(() => {
    if (!simResults || visibleSteps.length === 0) return edges
    const activeEdgeMap = new Map<string, SimNodeResult>()
    for (const step of visibleSteps) {
      if (step.edgeId) activeEdgeMap.set(step.edgeId, step)
    }
    const latestEdgeId =
      visibleSteps.length > 0
        ? visibleSteps[visibleSteps.length - 1]?.edgeId
        : null
    return edges.map((e) => {
      const step = activeEdgeMap.get(e.id)
      if (!step) return e
      const isLatest = e.id === latestEdgeId
      const color =
        step.status === "pass"
          ? "#67E19F"
          : step.status === "fail"
            ? "#F56D5D"
            : step.status === "executed"
              ? "#34A6FF"
              : "#9F9FA9"
      return {
        ...e,
        animated: true,
        style: {
          stroke: color,
          strokeWidth: isLatest ? 2.5 : 2,
          opacity: isLatest ? 1 : 0.6,
          transition: "stroke 0.3s, stroke-width 0.3s, opacity 0.3s",
        },
      }
    })
  }, [edges, simResults, visibleSteps])

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

      if (
        type === "trigger" &&
        nodesRef.current.some((n) => n.type === "trigger")
      ) {
        toastManager.add({
          type: "error",
          title: "Only one trigger per workflow",
        })
        return
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect()
      const position = rfInstance.screenToFlowPosition({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })
      const newId = getId()
      setNodes((nds) => [
        ...nds,
        { id: newId, type, position, data: dataStr ? JSON.parse(dataStr) : {} },
      ])
      setSelectedNodeId(newId)
    },
    [rfInstance, setNodes]
  )

  const handleSave = () => {
    if (onSave) onSave(nodes, edges)
    initialSnapshot.current = JSON.stringify({
      n: nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
      e: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    })
  }

  return (
    <div className="flex h-full w-full">
      <WorkflowSidebar
        search={search}
        setSearch={setSearch}
        selectedNodeId={selectedNodeId}
        nodes={nodes}
        onNodeDataChange={handleNodeDataChange}
        workflowId={workflowId}
        activeTab={sidebarTab}
        onTabChange={setSidebarTab}
      />
      <div className="relative flex-1" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setRfInstance}
          onDragOver={onDragOver}
          onDrop={onDrop}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          fitView
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            animated: true,
            style: { stroke: "#27272A", strokeWidth: 1.5 },
          }}
          className="!bg-tw-bg"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#FFFFFF08"
          />
          <Controls className="!rounded-lg !border-tw-border !bg-tw-card [&>button]:!border-tw-border [&>button]:!bg-tw-card [&>button]:!text-tw-text-muted [&>button:hover]:!bg-tw-hover" />
          <MiniMap
            nodeColor={(n) => {
              if (simResults) {
                const r = simResults.find((sr) => sr.nodeId === n.id)
                if (r?.status === "pass") return "#67E19F"
                if (r?.status === "fail") return "#F56D5D"
                if (r?.status === "executed") return "#34A6FF"
              }
              return nodeColors[n.type as keyof typeof nodeColors] ?? "#9F9FA9"
            }}
            maskColor="#0D0D0F99"
            className="!rounded-lg !border-tw-border !bg-tw-surface"
          />
        </ReactFlow>

        <div className="absolute top-3 right-3 z-10 flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowSim(!showSim)
              if (showSim) {
                setSimResults(null)
                setSimStep(0)
              }
            }}
            className={
              showSim
                ? "bg-tw-card text-[#FAFAFA]"
                : "text-tw-text-muted hover:text-tw-text-primary"
            }
          >
            <PlayTriangleIcon13 />
            Test
          </Button>
          {onSave && (
            <Button
              variant={isDirty || saveLabel ? "default" : "secondary"}
              size="sm"
              onClick={handleSave}
              loading={isSaving}
              className="rounded-[10px]"
            >
              {saveLabel ?? "Save"}
            </Button>
          )}
        </div>

        {pendingChangeSummary && (
          <PendingChangesToolbar
            summary={pendingChangeSummary}
            onAccept={handleAcceptChanges}
            onCancel={handleRevertChanges}
          />
        )}
      </div>
      {showSim && (
        <SimulationPanel
          nodes={nodes}
          edges={edges}
          simResults={simResults}
          setSimResults={setSimResults}
          simStep={simStep}
          setSimStep={setSimStep}
          repoId={repoId}
        />
      )}
    </div>
  )
}

function SimulationPanel({
  nodes,
  edges,
  simResults,
  setSimResults,
  simStep,
  setSimStep,
  repoId,
}: {
  nodes: Node[]
  edges: Edge[]
  simResults: SimNodeResult[] | null
  setSimResults: (r: SimNodeResult[] | null) => void
  simStep: number
  setSimStep: (s: number) => void
  repoId?: string
}) {
  const trpc = useTRPC()
  const [mode, setMode] = useState<SimMode>("user")
  const [username, setUsername] = useState("")
  const [contextValues, setContextValues] = useState<Record<string, unknown>>(
    {}
  )
  const [error, setError] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [userCard, setUserCard] = useState<{
    login: string
    avatarUrl: string
    name: string | null
  } | null>(null)

  const fetchUser = useMutation(trpc.workflows.simulate.mutationOptions())

  const suggestionsQuery = useQuery(
    trpc.events.activeUsers.queryOptions(
      { repoId: repoId ?? "", days: 90 },
      { enabled: !!repoId && mode === "user", staleTime: 60_000 }
    )
  )
  const suggestions = (suggestionsQuery.data ?? []).slice(0, 8)

  const simInputs = useMemo(
    () => collectSimInputs(nodes, edges),
    [nodes, edges]
  )

  useEffect(() => {
    if (!isAnimating || !simResults) return
    if (simStep >= simResults.length) {
      setIsAnimating(false)
      return
    }
    const currentResult = simResults[simStep - 1]
    const delay = currentResult?.pauseMs ?? 400
    const timer = setTimeout(() => setSimStep(simStep + 1), delay)
    return () => clearTimeout(timer)
  }, [isAnimating, simStep, simResults, setSimStep])

  const setField = (key: string, value: unknown) => {
    setContextValues((prev) => ({ ...prev, [key]: value }))
  }

  const fetchAndFill = async () => {
    if (!username.trim()) {
      setError("Enter a GitHub username")
      return
    }
    setError(null)
    const result = await fetchUser.mutateAsync({
      username: username.trim(),
      repoId,
    })
    if (!result.found) {
      setError(`User "${username}" not found`)
      return
    }
    setUserCard(result.user)
    setContextValues((prev) => ({
      ...prev,
      ...(result.data as Record<string, unknown>),
      username: result.user.login,
    }))
  }

  const runSim = () => {
    setError(null)
    setSimStep(0)
    const results = simulateWorkflow(
      nodes,
      edges,
      mode,
      contextValues,
      actionLabels
    )
    setSimResults(results)
    setSimStep(0)
    setIsAnimating(true)
  }

  const clear = () => {
    setSimResults(null)
    setUserCard(null)
    setError(null)
    setSimStep(0)
    setIsAnimating(false)
  }

  const visibleResults = simResults?.slice(0, simStep) ?? []
  const passCount = visibleResults.filter((r) => r.status === "pass").length
  const failCount = visibleResults.filter((r) => r.status === "fail").length
  const execCount = visibleResults.filter((r) => r.status === "executed").length

  const groupedInputs = useMemo(() => {
    const groups: Record<string, SimInput[]> = {}
    for (const input of simInputs) {
      const group =
        input.source === "user"
          ? "User Data"
          : input.source === "content"
            ? "Content"
            : "Manual"
      if (!groups[group]) groups[group] = []
      groups[group].push(input)
    }
    return groups
  }, [simInputs])

  const hasUserInputs = Object.keys(groupedInputs).some(
    (g) => g === "User Data"
  )
  const hasContentInputs = Object.keys(groupedInputs).some(
    (g) => g === "Content"
  )

  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-auto border-l border-tw-border bg-tw-surface">
      <div className="px-3 pt-3 pb-2">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-[13px] font-medium text-tw-text-primary">
            Test run
          </span>
          {simResults && (
            <Button
              variant="ghost"
              size="xs"
              onClick={clear}
              className="text-[11px] text-[#FFFFFF40] hover:text-[#FFFFFF73]"
            >
              Clear
            </Button>
          )}
        </div>
        <p className="m-0 mb-3 text-[11px] leading-relaxed text-[#FFFFFF40]">
          Run your workflow against test data to see how each node evaluates.
        </p>

        <div className="mb-3 flex items-center gap-1 rounded-[10px] bg-tw-card p-1">
          {[
            ["user", "Real User"] as const,
            ["pass", "Force Pass"] as const,
            ["fail", "Force Fail"] as const,
          ].map(([m, label]) => (
            <Button
              variant="ghost"
              key={m}
              type="button"
              onClick={() => {
                setMode(m)
                clear()
              }}
              className={`flex h-7 flex-1 cursor-pointer items-center justify-center rounded-[6px] px-2 text-[12px] font-medium transition-colors ${
                mode === m
                  ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                  : "text-[#9F9FA9] hover:text-[#EEEEEE]"
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {mode === "user" && (
        <div className="px-3 pb-3">
          <div className="mb-2 flex h-9 items-center gap-2 rounded-[10px] bg-tw-card px-2.5">
            <UserCircleMutedIcon13 className="text-[#6E6E6E]" />
            <input
              type="text"
              placeholder="GitHub username..."
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && fetchAndFill()}
              className="flex-1 bg-transparent text-[13px] text-white outline-none placeholder:text-[#6E6E6E]"
            />
            <Button
              variant="link"
              size="xs"
              onClick={fetchAndFill}
              disabled={fetchUser.isPending || !username.trim()}
              className="h-auto shrink-0 p-0 text-[11px] text-tw-accent"
            >
              {fetchUser.isPending ? "..." : "Fetch"}
            </Button>
          </div>

          {suggestions.length > 0 && !username && !userCard && (
            <div className="mb-2 flex flex-wrap gap-1">
              {suggestions.map((s) => (
                <Button
                  key={s.username}
                  variant="ghost"
                  size="xs"
                  onClick={() => setUsername(s.username ?? "")}
                  className="gap-1.5 bg-tw-card text-left hover:bg-tw-hover"
                >
                  <img
                    src={`https://github.com/${s.username}.png?size=24`}
                    alt=""
                    className="size-4 rounded-full"
                  />
                  <span className="text-[11px] text-tw-text-secondary">
                    {s.username}
                  </span>
                </Button>
              ))}
            </div>
          )}

          {userCard && (
            <div className="mb-3 flex items-center gap-2.5">
              <img
                src={userCard.avatarUrl}
                alt=""
                className="size-7 rounded-full"
              />
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[12px] font-medium text-tw-text-primary">
                  {userCard.name ?? userCard.login}
                </p>
                <p className="m-0 text-[10px] text-[#FFFFFF40]">
                  @{userCard.login}
                </p>
              </div>
            </div>
          )}

          {simInputs.length > 0 && (
            <>
              {hasUserInputs && (
                <div className="mb-3">
                  <p className="m-0 mb-2 text-[11px] text-[#FFFFFF40]">
                    {userCard
                      ? "Fetched from GitHub. Edit to test edge cases."
                      : "Enter test values for the contributor profile."}
                  </p>
                  <div className="overflow-hidden rounded-[10px] bg-tw-card">
                    {(groupedInputs["User Data"] ?? []).map((input, idx) => (
                      <div
                        key={input.key}
                        className={`flex h-8 items-center justify-between gap-2 px-3 ${idx > 0 ? "border-t border-[#FFFFFF08]" : ""}`}
                      >
                        <span className="shrink-0 text-[11px] text-[#FFFFFF59]">
                          {input.label}
                        </span>
                        {input.type === "boolean" ? (
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() =>
                              setField(input.key, !contextValues[input.key])
                            }
                            className="bg-transparent text-right text-[12px] text-tw-text-primary tabular-nums outline-none"
                          >
                            {contextValues[input.key] ? "true" : "false"}
                          </Button>
                        ) : (
                          <input
                            type={input.type === "number" ? "number" : "text"}
                            value={String(contextValues[input.key] ?? "")}
                            onChange={(e) =>
                              setField(
                                input.key,
                                input.type === "number"
                                  ? Number(e.target.value)
                                  : e.target.value
                              )
                            }
                            className="min-w-0 flex-1 bg-transparent text-right text-[12px] text-tw-text-primary tabular-nums outline-none"
                            placeholder="0"
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {hasContentInputs && (
                <div className="mb-3">
                  <p className="m-0 mb-2 text-[11px] text-[#FFFFFF40]">
                    Content to test against language and pattern rules.
                  </p>
                  {(groupedInputs["Content"] ?? []).map((input) => (
                    <textarea
                      key={input.key}
                      value={String(contextValues[input.key] ?? "")}
                      onChange={(e) => setField(input.key, e.target.value)}
                      placeholder="Paste PR body, issue text, or comment..."
                      rows={3}
                      className="w-full resize-none rounded-[10px] bg-tw-card px-3 py-2 text-[12px] text-tw-text-primary outline-none placeholder:text-[#6E6E6E]"
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <div className="mt-auto px-3 pb-3">
        {error && <p className="mb-2 text-[11px] text-tw-error">{error}</p>}
        <Button
          variant="secondary"
          size="sm"
          onClick={runSim}
          disabled={fetchUser.isPending}
          className="w-full rounded-[10px]"
        >
          Run test
        </Button>
      </div>

      {simResults && (
        <div className="flex-1 overflow-auto">
          <div className="flex items-center gap-3 border-t border-tw-border px-3 py-2.5">
            <span className="text-[11px] text-tw-text-tertiary tabular-nums">
              {passCount} pass
            </span>
            <span className="text-[11px] text-tw-text-tertiary tabular-nums">
              {failCount} fail
            </span>
            <span className="text-[11px] text-tw-text-tertiary tabular-nums">
              {execCount} exec
            </span>
            {isAnimating && (
              <span className="ml-auto text-[10px] text-tw-text-tertiary tabular-nums">
                {simStep}/{simResults.length}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-0.5 px-3 pb-3">
            {visibleResults.map((r, i) => {
              const node = nodes.find((n) => n.id === r.nodeId)
              const label =
                node?.type === "trigger"
                  ? (triggerLabels[node.data.trigger as string] ?? "Trigger")
                  : node?.type === "rule"
                    ? (ruleLabels[node.data.rule as string] ?? "Rule")
                    : node?.type === "action"
                      ? (actionLabels[node.data.action as string] ?? "Action")
                      : node?.type === "logic"
                        ? (node.data.gate as string)
                        : node?.type === "condition"
                          ? "Condition"
                          : node?.type === "delay"
                            ? "Delay"
                            : node?.type === "transform"
                              ? "Transform"
                              : (node?.type ?? "Node")
              const statusText =
                r.status === "pass"
                  ? "pass"
                  : r.status === "fail"
                    ? "fail"
                    : r.status === "executed"
                      ? "exec"
                      : "skip"
              const statusColor =
                r.status === "pass"
                  ? "text-[#FFFFFF59]"
                  : r.status === "fail"
                    ? "text-tw-error"
                    : "text-[#FFFFFF40]"
              const isLatest = i === visibleResults.length - 1 && isAnimating
              const isDelayWaiting =
                isLatest && r.pauseMs != null && r.pauseMs > 400
              return (
                <div
                  key={r.nodeId}
                  className={`rounded-lg px-2.5 py-2 transition-colors duration-200 ${
                    isLatest ? "bg-tw-card" : "hover:bg-[#ffffff04]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-tw-text-primary">
                      {label}
                    </span>
                    {isDelayWaiting ? (
                      <div className="h-3 w-3 shrink-0 animate-spin rounded-full border-[1.5px] border-[#FFFFFF40] border-t-transparent" />
                    ) : (
                      <span
                        className={`text-[10px] tabular-nums ${statusColor} shrink-0`}
                      >
                        {statusText}
                      </span>
                    )}
                  </div>
                  {r.detail && (
                    <p className="mt-0.5 text-[11px] leading-relaxed text-[#FFFFFF40]">
                      {r.detail}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
