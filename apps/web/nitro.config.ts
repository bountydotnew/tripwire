import { defineConfig } from "nitro"
import evlog from "evlog/nitro/v3"

const isProd = process.env.NODE_ENV === "production"

export default defineConfig({
  experimental: {
    asyncContext: true,
  },
  modules: [
    evlog({
      env: { service: "tripwire" },
      // Mask credit cards, emails, IPs, phone numbers, JWTs, Bearer tokens, IBANs.
      redact: true,
      // Tighter logging in production; keep everything during development.
      pretty: !isProd,
      sampling: {
        // Head sampling: drop a percentage at the start of each request.
        rates: {
          debug: 0, // never keep debug in prod logs
          info: isProd ? 25 : 100, // 25% of successful requests in prod
          warn: 100,
          error: 100, // always keep errors
        },
        // Tail sampling: force-keep when any of these conditions match,
        // regardless of the head sampling decision. OR-logic.
        keep: [
          { status: 400 }, // 4xx + 5xx
          { duration: 1000 }, // slow requests (>=1s)
          { path: "/api/github/webhook" }, // every webhook
          { path: "/api/trpc/rules.*" }, // rule edits
          { path: "/api/trpc/requests.*" }, // contributor requests
          { path: "/api/trpc/whitelist.*" }, // list mutations
          { path: "/api/trpc/blacklist.*" },
        ],
      },
    }),
  ],
})
