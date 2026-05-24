import { createFileRoute, redirect } from "@tanstack/react-router"
import { RULES_WORKSPACE_TAB_SEGMENTS } from "#/constants/rules-tab-paths"

const TAB_SET = new Set<string>(RULES_WORKSPACE_TAB_SEGMENTS)

function tabFromLocationSearch(search: unknown): string | null {
  if (search == null) return null
  if (typeof search === "string") {
    const s = search.startsWith("?") ? search.slice(1) : search
    return new URLSearchParams(s).get("tab")
  }
  if (typeof search === "object" && "tab" in (search as object)) {
    const v = (search as { tab?: unknown }).tab
    return typeof v === "string" ? v : null
  }
  return null
}

export const Route = createFileRoute("/_app/$orgHandle/rules/")({
  beforeLoad: ({ location, params }) => {
    const orgHandle = params.orgHandle
    const tab = tabFromLocationSearch(location.search)

    if (tab && TAB_SET.has(tab)) {
      let sp: URLSearchParams
      if (typeof location.search === "string") {
        const s = location.search.startsWith("?")
          ? location.search.slice(1)
          : location.search
        sp = new URLSearchParams(s)
      } else if (location.search && typeof location.search === "object") {
        sp = new URLSearchParams(
          Object.entries(location.search as Record<string, string>)
            .filter(([, v]) => v !== undefined && v !== "")
            .map(([k, v]) => [k, String(v)])
        )
      } else {
        sp = new URLSearchParams()
      }
      sp.delete("tab")
      const rest = sp.toString()
      throw redirect({
        href: `/${orgHandle}/rules/${tab}${rest ? `?${rest}` : ""}`,
        replace: true,
      })
    }

    throw redirect({
      href: `/${orgHandle}/rules/marketplace`,
      replace: true,
    })
  },
})
