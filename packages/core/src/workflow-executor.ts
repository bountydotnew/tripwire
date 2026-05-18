import {
  getEvaluatorForNode,
  resolveSubtype,
  type EvalResult,
} from "./node-evaluators";

export interface ExecutionStep {
  nodeId: string;
  edgeId?: string;
  type: string;
  subtype: string;
  status: "pass" | "fail" | "skipped" | "executed";
  detail: string;
  pauseMs?: number;
}

export type ForceMode = "pass" | "fail" | null;

interface WorkflowNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
}

export function executeWorkflow(
  nodes: WorkflowNode[],
  edges: WorkflowEdge[],
  context: Record<string, unknown>,
  forceMode: ForceMode = null,
): ExecutionStep[] {
  const steps: ExecutionStep[] = [];
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const outgoing = new Map<string, WorkflowEdge[]>();
  for (const e of edges) {
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e);
  }

  const ctx = { ...context };
  const nodeOutcome = new Map<string, boolean>();
  const triggers = nodes.filter((n) => n.type === "trigger");
  const queue = [...triggers.map((n) => n.id)];
  const visited = new Set<string>();

  for (const t of triggers) {
    const subtype = resolveSubtype("trigger", t.data);
    const evaluator = getEvaluatorForNode("trigger", t.data);
    const result = evaluator?.evaluate(t.data, ctx) ?? { pass: true, detail: `Triggered: ${subtype}` };
    steps.push({
      nodeId: t.id,
      type: "trigger",
      subtype,
      status: "executed",
      detail: result.detail,
    });
    nodeOutcome.set(t.id, true);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const outEdges = outgoing.get(current) ?? [];
    for (const edge of outEdges) {
      const targetNode = nodeMap.get(edge.target);
      if (!targetNode || visited.has(edge.target)) continue;

      const sourceOutcome = nodeOutcome.get(current);
      const sourceHandle = edge.sourceHandle;
      const sourceNode = nodeMap.get(current);

      if (sourceNode && (sourceNode.type === "rule" || sourceNode.type === "condition")) {
        if (sourceHandle === "pass" && sourceOutcome === false) continue;
        if (sourceHandle === "fail" && sourceOutcome === true) continue;
        if (sourceHandle === "true" && sourceOutcome === false) continue;
        if (sourceHandle === "false" && sourceOutcome === true) continue;
      }

      const nodeType = targetNode.type;
      const subtype = resolveSubtype(nodeType, targetNode.data);
      let pass = true;
      let detail = "";
      let pauseMs: number | undefined;

      if (nodeType === "logic") {
        const gate = (targetNode.data.gate as string) ?? "AND";
        const incomingEdges = edges.filter((e) => e.target === edge.target);
        const inputs = incomingEdges
          .map((e) => nodeOutcome.get(e.source))
          .filter((v) => v !== undefined) as boolean[];

        if (gate === "AND") pass = inputs.length > 0 && inputs.every(Boolean);
        else if (gate === "OR") pass = inputs.some(Boolean);
        else if (gate === "NOT") pass = inputs.length > 0 && !inputs[0];
        detail = `${gate}(${inputs.map((r) => (r ? "T" : "F")).join(", ")}) -> ${pass ? "TRUE" : "FALSE"}`;
      } else {
        const evaluator = getEvaluatorForNode(nodeType, targetNode.data);
        if (!evaluator) {
          detail = `No evaluator for ${nodeType}/${subtype}`;
        } else {
          let result: EvalResult;

          if (forceMode && (nodeType === "rule" || nodeType === "condition")) {
            pass = forceMode === "pass";
            detail = `Forced ${forceMode === "pass" ? "PASS" : "FAIL"}`;
          } else {
            result = evaluator.evaluate(targetNode.data, ctx);
            pass = result.pass;
            detail = result.detail;
            pauseMs = result.pauseMs;

            if (result.producedContext) {
              Object.assign(ctx, result.producedContext);
            }
          }
        }
      }

      const status: ExecutionStep["status"] =
        nodeType === "action" || nodeType === "transform" || nodeType === "delay" || nodeType === "trigger"
          ? "executed"
          : pass ? "pass" : "fail";

      steps.push({
        nodeId: edge.target,
        edgeId: edge.id,
        type: nodeType,
        subtype,
        status,
        detail,
        pauseMs,
      });

      nodeOutcome.set(edge.target, pass);
      queue.push(edge.target);
    }
  }

  const reachable = new Set(steps.map((s) => s.nodeId));
  for (const node of nodes) {
    if (!reachable.has(node.id) && node.type !== "trigger") {
      steps.push({
        nodeId: node.id,
        type: node.type,
        subtype: resolveSubtype(node.type, node.data),
        status: "skipped",
        detail: "Unreachable -- not connected to a trigger",
      });
    }
  }

  return steps;
}
