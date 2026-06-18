import { useMemo } from "react"

/**
 * True when the draft has diverged from the baseline. Uses JSON
 * equality, which is fine for plain settings objects (no Dates,
 * Maps, Sets, etc. — those exist on row metadata that the form
 * doesn't edit).
 */
export function useFormDirty<T>(draft: T, baseline: T): boolean {
  return useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(baseline),
    [draft, baseline]
  )
}
