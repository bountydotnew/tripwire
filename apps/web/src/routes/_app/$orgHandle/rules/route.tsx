import { createFileRoute, redirect } from "@tanstack/react-router"
import { RulesWorkspaceLayoutRoute } from "#/components/layout/app/rules/rules-workspace-layout"
import { RulesWorkspaceSkeleton } from "#/components/layout/app/rules/rules-workspace-skeleton"
import { privateHeaders } from "#/lib/seo"

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

export const Route = createFileRoute("/_app/$orgHandle/rules")({
  beforeLoad: ({ location, params }) => {
    const orgHandle = params.orgHandle
    if (tabFromLocationSearch(location.search) !== "custom") return

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
      href: `/${orgHandle}/rules/custom${rest ? `?${rest}` : ""}`,
      replace: true,
    })
  },
  preload: false,
  headers: () => privateHeaders,
  pendingComponent: RulesWorkspaceSkeleton,
  component: RulesWorkspaceLayoutRoute,
})
