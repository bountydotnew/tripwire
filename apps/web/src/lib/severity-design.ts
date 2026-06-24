export type Severity = "info" | "warning" | "success" | "error"

export const SEVERITY_DOT_COLORS = {
  success: "bg-tw-success",
  error: "bg-tw-error",
  warning: "bg-tw-warning",
  info: "bg-tw-accent",
} as const satisfies Record<Severity, string>

export function severityDotColor(severity: string | null | undefined): string {
  if (!severity) return SEVERITY_DOT_COLORS.info
  return Object.prototype.hasOwnProperty.call(SEVERITY_DOT_COLORS, severity)
    ? SEVERITY_DOT_COLORS[severity as Severity]
    : SEVERITY_DOT_COLORS.info
}
