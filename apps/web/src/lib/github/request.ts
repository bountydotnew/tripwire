// Re-export shim. Canonical location is `@tripwire/github/request` so
// the github package can use the same helpers (timeout/abort wiring,
// conditional headers) from server-side fetchers.
export * from "@tripwire/github/request"
