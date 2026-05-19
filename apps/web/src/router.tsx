import { createRouter as createTanStackRouter } from "@tanstack/react-router"
import { routeTree } from "./routeTree.gen"

import { createQueryContext } from "./integrations/tanstack-query/root-provider"
import { attachDevRouterTiming } from "./lib/dev-router-timing"

export function getRouter() {
  // Create fresh context per router instance (per SSR request)
  const context = createQueryContext()

  const router = createTanStackRouter({
    routeTree,

    context,

    scrollRestoration: true,
    defaultPreload: false,
    //defaultPreload: intent,
    defaultPreloadStaleTime: 0,
  })

  attachDevRouterTiming(router)

  return router
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
