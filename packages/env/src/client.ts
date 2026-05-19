/// <reference types="vite/client" />
import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

/**
 * Vite-only client env. Reads from `import.meta.env`. Bundles statically at
 * build time — only `VITE_*` vars are exposed to the browser.
 *
 * Do NOT import this from a non-Vite runtime (e.g. the CLI). Use
 * `@tripwire/env/server` for server vars instead.
 */
export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_GITHUB_APP_SLUG: z.string().min(1).optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
})
