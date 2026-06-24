import { defineConfig, loadEnv } from "vite"
import { devtools } from "@tanstack/devtools-vite"
import tsconfigPaths from "vite-tsconfig-paths"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import { nitro } from "nitro/vite"
import { tripwireDevServeTiming } from "./vite/dev-serve-timing-plugin"

const config = defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "")
  const tanstackDevtoolsEnabled = env.VITE_DISABLE_TANSTACK_DEVTOOLS !== "1"

  return {
    // .env lives at the monorepo root so every package + app shares it.
    // @tripwire/env auto-loads it for server code; this points Vite at the
    // same file so VITE_* client vars resolve too.
    envDir: "../..",
    server: {
      allowedHosts: [".ngrok-free.app"],
    },
    plugins: [
      ...(tanstackDevtoolsEnabled ? [devtools()] : []),
      tripwireDevServeTiming(),
      tsconfigPaths({ projects: ["./tsconfig.json"] }),
      tailwindcss(),
      tanstackStart(),
      nitro(),
      viteReact({
        babel: {
          plugins: ["babel-plugin-react-compiler"],
        },
      }),
    ],
    resolve: {
      alias: {
        // zod@4 ships two APIs: "zod" (v4) and "zod/v3" (legacy).
        // When both are imported (better-auth uses v4, @unkey/api uses v3),
        // the bundler creates two `coerce` objects but only exports the v3
        // one — dropping v4's `.meta()` and crashing better-auth at runtime.
        // Aliasing v3 → v4 deduplicates them into one API.
        "zod/v3": "zod",
      },
      dedupe: ["react", "react-dom"],
    },
  }
})

export default config
