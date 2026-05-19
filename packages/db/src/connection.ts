import { drizzle } from "drizzle-orm/node-postgres"
import { env } from "@tripwire/env/server"
import * as schema from "./schema"

if (!env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required for @tripwire/db.")
}

export const db = drizzle(env.DATABASE_URL, { schema })

export type Database = typeof db
