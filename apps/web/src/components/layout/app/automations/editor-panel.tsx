import type { Node } from "@xyflow/react"
import { Button } from "@tripwire/ui/button"
import {
  getNodeEntry,
  type ParamDefinition,
} from "@tripwire/core/workflow-registry"
import type { WorkflowNodeType } from "@tripwire/db"
import { getNodeStyle } from "#/lib/workflow/node-styles"
import {
  nodeIcons,
  triggerLabels,
  ruleLabels,
  actionLabels,
} from "./node-types"

interface EditorPanelProps {
  selectedNodeId: string | null
  nodes: Node[]
  onNodeDataChange: (nodeId: string, data: Record<string, unknown>) => void
}

export function EditorPanel({
  selectedNodeId,
  nodes,
  onNodeDataChange,
}: EditorPanelProps) {
  const node = selectedNodeId
    ? nodes.find((n) => n.id === selectedNodeId)
    : null

  if (!node) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="text-[13px] leading-relaxed text-tw-text-muted">
          Select a node on the canvas to edit its properties.
        </div>
      </div>
    )
  }

  const nodeType = node.type as WorkflowNodeType
  const subtype = getSubtype(nodeType, node.data)
  const entry = getNodeEntry(nodeType, subtype)
  const style = getNodeStyle(nodeType)
  const icon = nodeIcons[nodeType as keyof typeof nodeIcons]
  const label = getNodeLabel(nodeType, node.data)

  return (
    <div className="flex h-full flex-col overflow-auto">
      <div
        className="flex items-center gap-3 border-b px-4 py-4"
        style={{ borderColor: style.border }}
      >
        <div className="flex size-8 items-center justify-center rounded-lg">
          <span style={{ color: style.accent }}>{icon}</span>
        </div>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-medium text-tw-text-primary">
            {label}
          </span>
          {entry?.definition && (
            <span className="mt-0.5 text-[11px] leading-snug text-tw-text-tertiary">
              {entry.definition}
            </span>
          )}
        </div>
      </div>

      {entry?.example && (
        <div className="border-b border-tw-border px-4 py-3">
          <span className="text-[10px] font-medium tracking-wide text-tw-text-muted uppercase">
            Example
          </span>
          <p className="mt-1 text-[12px] leading-relaxed text-tw-text-secondary">
            {entry.example}
          </p>
        </div>
      )}

      {entry && entry.params.length > 0 ? (
        <div className="flex flex-col gap-4 px-4 py-4">
          {entry.params.map((param) => {
            if (!isParamVisible(param, node.data as Record<string, unknown>)) {
              return null
            }
            return (
              <ParamField
                key={param.key}
                param={param}
                value={getParamValue(nodeType, node.data, param.key)}
                onChange={(val) => {
                  onNodeDataChange(
                    node.id,
                    buildUpdatedData(nodeType, node.data, param.key, val)
                  )
                }}
              />
            )
          })}
        </div>
      ) : (
        <div className="px-4 py-6 text-[12px] text-tw-text-muted">
          No configurable properties.
        </div>
      )}
    </div>
  )
}

function isParamVisible(
  param: ParamDefinition,
  data: Record<string, unknown>
): boolean {
  if (!param.condition) return true
  const fieldValue = data[param.condition.field]
  if (Array.isArray(param.condition.value)) {
    return param.condition.value.includes(String(fieldValue))
  }
  return String(fieldValue) === param.condition.value
}

function getSubtype(
  type: WorkflowNodeType,
  data: Record<string, unknown>
): string {
  switch (type) {
    case "trigger":
      return (data.trigger as string) ?? "pr_opened"
    case "rule":
      return (data.rule as string) ?? "accountAge"
    case "condition":
      return "custom"
    case "logic":
      return (data.gate as string) ?? "AND"
    case "action":
      return (data.action as string) ?? "block"
    case "delay":
      return "wait"
    case "transform":
      return (data.transform as string) ?? "fetch_github_user"
    default:
      return ""
  }
}

function getNodeLabel(
  type: WorkflowNodeType,
  data: Record<string, unknown>
): string {
  switch (type) {
    case "trigger":
      return triggerLabels[data.trigger as string] ?? "Trigger"
    case "rule":
      return ruleLabels[data.rule as string] ?? "Rule"
    case "action":
      return actionLabels[data.action as string] ?? "Action"
    case "logic":
      return `${(data.gate as string) ?? "AND"} Gate`
    case "condition":
      return "Condition"
    case "delay":
      return "Delay"
    case "transform":
      return String(data.transform ?? "Transform")
    default:
      return "Node"
  }
}

function getParamValue(
  type: WorkflowNodeType,
  data: Record<string, unknown>,
  key: string
): unknown {
  if (type === "rule") {
    const params = data.params as Record<string, unknown> | undefined
    return params?.[key] ?? data[key]
  }
  return data[key]
}

function buildUpdatedData(
  type: WorkflowNodeType,
  data: Record<string, unknown>,
  key: string,
  value: unknown
): Record<string, unknown> {
  if (type === "rule") {
    const params = {
      ...((data.params as Record<string, unknown>) ?? {}),
      [key]: value,
    }
    return { ...data, params }
  }
  return { ...data, [key]: value }
}

interface ParamFieldProps {
  param: ParamDefinition
  value: unknown
  onChange: (value: unknown) => void
}

function ParamField({ param, value, onChange }: ParamFieldProps) {
  const resolvedValue = value ?? param.default ?? ""

  if (param.type === "select" && param.options) {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-tw-text-tertiary">
          {param.name}
          {param.required ? " *" : ""}
        </label>
        <select
          value={String(resolvedValue)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 cursor-pointer rounded-[10px] border border-tw-border bg-tw-card px-3 text-[13px] text-tw-text-primary outline-none focus:border-[#FFFFFF1A]"
        >
          {param.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {param.description && (
          <span className="text-[11px] leading-relaxed text-tw-text-muted">
            {param.description}
          </span>
        )}
      </div>
    )
  }

  if (param.type === "number") {
    return (
      <div className="flex flex-col gap-1.5">
        <label className="text-[11px] font-medium text-tw-text-tertiary">
          {param.name}
          {param.required ? " *" : ""}
        </label>
        <input
          type="number"
          value={String(resolvedValue)}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-9 rounded-[10px] border border-tw-border bg-tw-card px-3 text-[13px] text-tw-text-primary outline-none focus:border-[#FFFFFF1A]"
        />
        {param.description && (
          <span className="text-[11px] leading-relaxed text-tw-text-muted">
            {param.description}
          </span>
        )}
      </div>
    )
  }

  if (param.type === "boolean") {
    return (
      <div className="flex items-center justify-between gap-3 py-1">
        <label className="text-[11px] font-medium text-tw-text-tertiary">
          {param.name}
        </label>
        <Button
          variant="ghost"
          onClick={() => onChange(!resolvedValue)}
          className={`h-5 w-9 rounded-full border-0 p-0 ${
            resolvedValue
              ? "bg-tw-accent hover:bg-tw-accent/90"
              : "bg-tw-border hover:bg-tw-border/90"
          }`}
        >
          <div
            className={`h-3.5 w-3.5 rounded-full bg-white transition-transform ${
              resolvedValue ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-[11px] font-medium text-tw-text-tertiary">
        {param.name}
        {param.required ? " *" : ""}
      </label>
      <input
        type="text"
        value={String(resolvedValue)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={param.description}
        className="h-9 rounded-[10px] border border-tw-border bg-tw-card px-3 text-[13px] text-tw-text-primary outline-none placeholder:text-[#6E6E6E] focus:border-[#FFFFFF1A]"
      />
      {param.description && (
        <span className="text-[11px] leading-relaxed text-tw-text-muted">
          {param.description}
        </span>
      )}
    </div>
  )
}
