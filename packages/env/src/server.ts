import { existsSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { createEnv } from "@t3-oss/env-core"
import { config as loadDotenv } from "dotenv"
import { z } from "zod"

// ─── Root .env autoload ──────────────────────────────────────────
// Walk up from this file to the monorepo root (marked by pnpm-workspace.yaml)
// and load .env from there. dotenv is idempotent — vars already in
// process.env (e.g. injected by Vite / Nitro / CI) win.
//
// Any package that imports `@tripwire/env/server` transitively gets the
// monorepo root .env loaded before it reads `process.env`.

function findMonorepoRoot(startDir: string): string {
  let dir = startDir
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return startDir
}

const here = dirname(fileURLToPath(import.meta.url))
const monorepoRoot = findMonorepoRoot(here)
loadDotenv({
  path: [resolve(monorepoRoot, ".env.local"), resolve(monorepoRoot, ".env")],
})

const isProd = process.env.NODE_ENV === "production"

/**
 * Server-side env. Read from `process.env`. Safe to import in any runtime
 * (Vite SSR, Node, Bun, edge). Do NOT import from the browser bundle —
 * t3-env throws on access to server vars from client code.
 *
 * Apps that need both server and Vite-client env should also import
 * `@tripwire/env/client` for the VITE_* vars.
 */
export const env = createEnv({
  server: {
    BETTER_AUTH_URL: z.string().url().optional(),
    BETTER_AUTH_SECRET: z
      .string()
      .min(1)
      .optional()
      .refine(
        (val) =>
          !isProd || (val !== undefined && val !== "" && val !== "tripwire"),
        {
          message:
            "BETTER_AUTH_SECRET must be a strong unique value in production (generate with: openssl rand -hex 32)",
        }
      ),
    GITHUB_CLIENT_ID: z.string().min(1).optional(),
    GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
    GITHUB_APP_ID: z.string().min(1).optional(),
    GITHUB_APP_PRIVATE_KEY: z
      .string()
      .min(1)
      .optional()
      .refine((val) => !isProd || (val !== undefined && val !== ""), {
        message: "GITHUB_APP_PRIVATE_KEY must be set in production",
      }),
    GITHUB_WEBHOOK_SECRET: z
      .string()
      .min(1)
      .optional()
      .refine((val) => !isProd || (val !== undefined && val !== ""), {
        message: "GITHUB_WEBHOOK_SECRET must be set in production",
      }),
    DATABASE_URL: z
      .string()
      .min(1)
      .optional()
      .refine((val) => !isProd || (val !== undefined && val !== ""), {
        message: "DATABASE_URL must be set in production",
      }),
    UNKEY_ROOT_KEY: z.string().min(1).optional(),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    AUTUMN_SECRET_KEY: z.string().min(1).optional(),
    BETTER_AUTH_API_KEY: z.string().min(1).optional(),
    TRIPWIRE_AI_MODEL: z.string().min(1).optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
})
