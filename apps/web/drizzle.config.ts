import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// .env lives at the monorepo root so all packages (web, future cli) share it.
config({ path: ["../../.env.local", "../../.env", ".env.local", ".env"] })

export default defineConfig({
  out: "./drizzle",
  schema: "../../packages/db/src/schema/index.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})
