import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";

const config = defineConfig({
  plugins: [
    devtools(),
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
});

export default config;
