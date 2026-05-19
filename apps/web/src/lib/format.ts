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
