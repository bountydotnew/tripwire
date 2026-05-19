import {
  nodeColors,
  nodeIcons,
  triggerLabels,
  ruleLabels,
  actionLabels,
  HIDDEN_RULES,
  RULE_KEYS,
} from "./node-types"
import {
  ScheduleIcon,
  ConditionIcon,
  LogicGateIcon,
  DelayIcon,
  TransformIcon,
} from "#/components/icons/node-icons"
import { ToolboxSearchLoupeIcon13 } from "#/components/icons/app-chrome-icons"
import Dither from "#/components/Dither"
import type { ReactNode } from "react"

interface PaletteItem {
  type: string
  label: string
  sublabel: string
  color: string
  icon?: ReactNode
  data: Record<string, unknown>
}

const paletteGroups: { title: string; items: PaletteItem[] }[] = [
  {
    title: "Triggers",
    items: Object.entries(triggerLabels)
      .filter(([key]) => key !== "schedule_daily" && key !== "schedule_weekly")
      .map(([key, label]) => ({
        type: "trigger",
        label,
        sublabel: "Starts the workflow",
        color: nodeColors.trigger,
        icon: key === "schedule" ? <ScheduleIcon /> : nodeIcons.trigger,
        data:
          key === "schedule"
            ? {
                trigger: "schedule",
                scheduleType: "daily",
                dailyTime: "09:00",
                timezone: "UTC",
              }
            : { trigger: key },
      })),
  },
  {
    title: "Rules",
    items: RULE_KEYS.filter((key) => !HIDDEN_RULES.has(key)).map((key) => ({
      type: "rule",
      label: ruleLabels[key] ?? key,
      sublabel: "Pass / Fail check",
      color: nodeColors.rule,
      icon: nodeIcons.rule,
      data: { rule: key, params: {} },
    })),
  },
  {
    title: "Conditions",
    items: [
      {
        type: "condition",
        label: "Score Check",
        sublabel: "contributor score > N",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "score", operator: ">", value: "50" },
      },
      {
        type: "condition",
        label: "Username Match",
        sublabel: "regex pattern match",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "username", operator: "matches", value: ".*bot.*" },
      },
      {
        type: "condition",
        label: "Repo Count",
        sublabel: "public repos >= N",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "publicRepos", operator: ">=", value: "3" },
      },
      {
        type: "condition",
        label: "Account Age",
        sublabel: "days since creation",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "accountAgeDays", operator: ">", value: "30" },
      },
      {
        type: "condition",
        label: "PR File Count",
        sublabel: "files changed in PR",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "filesChanged", operator: "<=", value: "20" },
      },
      {
        type: "condition",
        label: "Custom Field",
        sublabel: "any field comparison",
        color: nodeColors.condition,
        icon: <ConditionIcon />,
        data: { field: "custom", operator: "==", value: "" },
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
        icon: <LogicGateIcon />,
        data: { gate: "AND" },
      },
      {
        type: "logic",
        label: "OR",
        sublabel: "Any input can pass",
        color: nodeColors.logic,
        icon: <LogicGateIcon />,
        data: { gate: "OR" },
      },
      {
        type: "logic",
        label: "NOT",
        sublabel: "Invert the result",
        color: nodeColors.logic,
        icon: <LogicGateIcon />,
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
        icon: <TransformIcon />,
        data: { transform: "fetch_github_user" },
      },
      {
        type: "transform",
        label: "Compute Score",
        sublabel: "Calculate contributor score",
        color: nodeColors.transform,
        icon: <TransformIcon />,
        data: { transform: "compute_score" },
      },
      {
        type: "transform",
        label: "Fetch PR Files",
        sublabel: "Get changed file list",
        color: nodeColors.transform,
        icon: <TransformIcon />,
        data: { transform: "fetch_pr_files" },
      },
      {
        type: "transform",
        label: "Scan History",
        sublabel: "Check repo history for user",
        color: nodeColors.transform,
        icon: <TransformIcon />,
        data: { transform: "scan_history" },
      },
      {
        type: "transform",
        label: "Detect Language",
        sublabel: "Analyze content language",
        color: nodeColors.transform,
        icon: <TransformIcon />,
        data: { transform: "detect_language" },
      },
    ],
  },
  {
    title: "Delays",
    items: [
      {
        type: "delay",
        label: "Delay",
        sublabel: "Configurable wait",
        color: nodeColors.delay,
        icon: <DelayIcon />,
        data: { durationValue: 5, durationUnit: "m" },
      },
    ],
  },
  {
    title: "Actions",
    items: Object.entries(actionLabels).map(([key, label]) => ({
      type: "action",
      label,
      sublabel: "Execute action",
      color: nodeColors.action,
      icon: nodeIcons.action,
      data: { action: key },
    })),
  },
]

interface ToolboxPanelProps {
  search: string
  setSearch: (s: string) => void
}

export function ToolboxPanel({ search, setSearch }: ToolboxPanelProps) {
  const onDragStart = (e: React.DragEvent, item: PaletteItem) => {
    e.dataTransfer.setData("application/reactflow-type", item.type)
    e.dataTransfer.setData(
      "application/reactflow-data",
      JSON.stringify(item.data)
    )
    e.dataTransfer.effectAllowed = "move"
  }

  const filtered = search.trim()
    ? (() => {
        const q = search.toLowerCase()
        return paletteGroups
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
    : paletteGroups

  return (
    <div className="relative flex h-full flex-col">
      <div className="shrink-0 border-b border-tw-border px-3 py-3">
        <div className="flex h-9 items-center gap-2 rounded-[10px] bg-tw-card px-3">
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

      <div className="relative z-10 flex-1 overflow-auto px-3 py-2">
        {filtered.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="mb-2 px-2 text-[11px] font-medium tracking-[0.08em] text-tw-text-tertiary uppercase">
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
                  <span className="shrink-0" style={{ color: item.color }}>
                    {item.icon}
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

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-[150px]"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, transparent 35%, rgba(0,0,0,0.1) 60%, rgba(0,0,0,0.4) 80%, black 100%)",
        }}
      >
        <Dither
          waveColor={[
            0.4627450980392157, 0.4627450980392157, 0.4627450980392157,
          ]}
          disableAnimation={false}
          enableMouseInteraction={false}
          mouseRadius={0.1}
          colorNum={4}
          pixelSize={2}
          waveAmplitude={0.25}
          waveFrequency={3}
          waveSpeed={0.1}
        />
      </div>
    </div>
  )
}
