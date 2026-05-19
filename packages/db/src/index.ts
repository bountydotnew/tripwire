// Public entry point for @tripwire/db.
//
// Main entry exports ONLY the schema (types, table definitions, defaults).
// Schema is browser-safe — pure data with no I/O.
//
// The live drizzle client lives at `@tripwire/db/client`. Import that only
// from server code (TRPC routers, tools, etc).

export * from "./schema"
