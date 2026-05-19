import type { Plugin } from "vite"

const MIN_MS = 15

/**
 * Dev server: logs how long Vite took to serve route modules (transform + I/O).
 * Filtered to /routes/ and slow-ish requests to keep the console readable.
 */
export function tripwireDevServeTiming(): Plugin {
  return {
    name: "tripwire-dev-serve-timing",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const raw = req.url?.split("?")[0] ?? ""
        if (
          req.method !== "GET" ||
          (!raw.includes("/routes/") && !raw.includes("%2Froutes%2F"))
        ) {
          next()
          return
        }

        const start = performance.now()
        res.on("finish", () => {
          const ms = Math.round(performance.now() - start)
          if (ms < MIN_MS) return
          console.info(`[vite] ${raw.slice(0, 140)} ${ms}ms`)
        })
        next()
      })
    },
  }
}
