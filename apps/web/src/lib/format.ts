/** Format camelCase to Title Case: "accountAge" → "Account Age" */
export function formatCamelCase(key: string): string {
  return key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim()
}

export function createLabelProxy(
  overrides: Record<string, string>
): Record<string, string> {
  return new Proxy(overrides, {
    get(target, prop: string) {
      return target[prop] ?? formatCamelCase(prop)
    },
  })
}

export function formatPercent(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(value)
}

export function formatCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    style: "currency",
  }).format(value)
}

export function safePercent(used: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(used / max, 1))
}

export function formatRelativeTime(
  date: Date | string | null | undefined
): string {
  if (!date) return "—"
  const d = date instanceof Date ? date : new Date(date)
  if (Number.isNaN(d.getTime())) return "—"
  const diffMs = Math.max(0, Date.now() - d.getTime())
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 1) return "just now"
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return "yesterday"
  if (diffDay < 7) return `${diffDay}d ago`
  const diffWk = Math.floor(diffDay / 7)
  if (diffWk < 5) return `${diffWk}w ago`
  const diffMo = Math.floor(diffDay / 30)
  if (diffMo < 12) return `${diffMo}mo ago`
  return `${Math.floor(diffDay / 365)}y ago`
}
