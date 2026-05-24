import type { AnyRouter, RouterEvents } from "@tanstack/router-core"

/** Dev-only: logs client navigations from route resolve through first paint hook. */
export function attachDevRouterTiming(router: AnyRouter): void {
  if (!import.meta.env.DEV || typeof window === "undefined") return

  let navT0 = 0
  let label = ""

  const reset = () => {
    navT0 = 0
    label = ""
  }

  router.subscribe(
    "onBeforeNavigate",
    (e: RouterEvents["onBeforeNavigate"]) => {
      if (!e.pathChanged && !e.hrefChanged) return
      navT0 = performance.now()
      label = e.toLocation.pathname
      console.info(`[router] → ${label}`)
    }
  )

  router.subscribe("onResolved", (e: RouterEvents["onResolved"]) => {
    if (navT0 === 0) return
    if (!e.pathChanged && !e.hrefChanged) return
    console.info(
      `[router] · resolve ${label} ${Math.round(performance.now() - navT0)}ms`
    )
  })

  router.subscribe("onRendered", () => {
    if (navT0 === 0) return
    console.info(
      `[router] ✓ render ${label} ${Math.round(performance.now() - navT0)}ms`
    )
    reset()
  })
}
