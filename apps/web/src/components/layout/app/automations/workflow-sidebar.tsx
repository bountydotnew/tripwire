import type { Node } from "@xyflow/react"
import { Button } from "@tripwire/ui/button"
import { AgentPanel } from "./agent-panel"
import { ToolboxPanel } from "./toolbox-panel"
import { EditorPanel } from "./editor-panel"

type SidebarTab = "agent" | "toolbox" | "editor"

interface WorkflowSidebarProps {
  search: string
  setSearch: (s: string) => void
  selectedNodeId: string | null
  nodes: Node[]
  onNodeDataChange: (nodeId: string, data: Record<string, unknown>) => void
  workflowId?: string
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}

const tabs: { key: SidebarTab; label: string }[] = [
  { key: "agent", label: "Agent" },
  { key: "toolbox", label: "Toolbox" },
  { key: "editor", label: "Editor" },
] as const

export function WorkflowSidebar({
  search,
  setSearch,
  selectedNodeId,
  nodes,
  onNodeDataChange,
  workflowId,
  activeTab,
  onTabChange,
}: WorkflowSidebarProps) {
  return (
    <div className="tw-inset m-2 mr-0 flex w-[380px] shrink-0 flex-col">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <div className="flex items-center gap-1 rounded-[10px] bg-tw-card p-1">
          {tabs.map(({ key, label }) => (
            <Button
              variant="ghost"
              key={key}
              type="button"
              onClick={() => onTabChange(key)}
              className={`flex h-7 flex-1 cursor-pointer items-center justify-center rounded-[6px] px-2.5 text-[12px] font-medium transition-colors ${
                activeTab === key
                  ? "bg-[#FAFAFA1A] text-[#EEEEEE]"
                  : "text-[#9F9FA9] hover:text-[#EEEEEE]"
              }`}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          className={activeTab === "agent" ? "flex h-full flex-col" : "hidden"}
        >
          <AgentPanel workflowId={workflowId} />
        </div>
        <div
          className={
            activeTab === "toolbox" ? "flex h-full flex-col" : "hidden"
          }
        >
          <ToolboxPanel search={search} setSearch={setSearch} />
        </div>
        <div
          className={activeTab === "editor" ? "flex h-full flex-col" : "hidden"}
        >
          <EditorPanel
            selectedNodeId={selectedNodeId}
            nodes={nodes}
            onNodeDataChange={onNodeDataChange}
          />
        </div>
      </div>
    </div>
  )
}

export type { SidebarTab }
