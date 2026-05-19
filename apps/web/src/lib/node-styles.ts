export interface NodeStyleEntry {
  accent: string
  bg: string
  border: string
}

export const NODE_STYLE_MAP: Record<string, NodeStyleEntry> = {
  trigger: { accent: "#34A6FF", bg: "#132736", border: "#1E6AA0" },
  rule: { accent: "#D4A843", bg: "#2E2714", border: "#8A6E2D" },
  condition: { accent: "#B07FDB", bg: "#261A36", border: "#7A549A" },
  logic: { accent: "#9F9FA9", bg: "#222226", border: "#5A5A62" },
  action: { accent: "#67E19F", bg: "#132E20", border: "#3D8A60" },
  delay: { accent: "#E19F67", bg: "#2E2014", border: "#8A6A3D" },
  transform: { accent: "#67B8E1", bg: "#132430", border: "#3D7A9A" },
} as const

export const HANDLE_COLORS = {
  pass: { bg: "#2D4A3A", border: "#3D6B50" },
  fail: { bg: "#4A2D2D", border: "#6B3D3D" },
} as const

export function getNodeStyle(type: string): NodeStyleEntry {
  return NODE_STYLE_MAP[type] ?? NODE_STYLE_MAP.logic
}
