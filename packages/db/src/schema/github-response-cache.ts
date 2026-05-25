import {
  bigint,
  index,
  integer,
  pgTable,
  text,
} from "drizzle-orm/pg-core"

/**
 * Read-through HTTP cache for GitHub API responses. One row per
 * (scope, resource, params) tuple. Holds the raw payload JSON plus
 * the metadata needed for conditional refresh (etag, last-modified)
 * and stale-if-rate-limited fallback (rateLimitRemaining, reset).
 *
 * `scope` is whatever string identifies the cache slot's tenant —
 * the looked-up GitHub username for public data, or a viewer userId
 * when responses vary per-token.
 */
export const githubResponseCache = pgTable(
  "github_response_cache",
  {
    cacheKey: text("cache_key").primaryKey(),
    scope: text("scope").notNull(),
    resource: text("resource").notNull(),
    paramsJson: text("params_json").notNull(),
    etag: text("etag"),
    lastModified: text("last_modified"),
    payloadJson: text("payload_json").notNull(),
    fetchedAt: bigint("fetched_at", { mode: "number" }).notNull(),
    freshUntil: bigint("fresh_until", { mode: "number" }).notNull(),
    rateLimitRemaining: integer("rate_limit_remaining"),
    rateLimitReset: bigint("rate_limit_reset", { mode: "number" }),
    statusCode: integer("status_code").notNull(),
  },
  (t) => [
    index("github_response_cache_scope_resource_idx").on(t.scope, t.resource),
  ],
)

/**
 * Per-signal-key timestamps. Webhooks bump these on relevant events;
 * cache reads compare `updatedAt` against `fetched_at` to decide
 * whether the cached entry is still valid.
 */
export const githubRevalidationSignal = pgTable(
  "github_revalidation_signal",
  {
    signalKey: text("signal_key").primaryKey(),
    updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
  },
)

/**
 * Versioned namespace counters. Reserved for split-mode KV cache
 * (KV storage key embeds a hash of namespace versions, so bumping
 * the counter re-routes future reads). Not used by the legacy D1
 * path but kept here for forward-compat with the split engine.
 */
export const githubCacheNamespace = pgTable("github_cache_namespace", {
  namespaceKey: text("namespace_key").primaryKey(),
  version: integer("version").notNull(),
  updatedAt: bigint("updated_at", { mode: "number" }).notNull(),
})

/**
 * Audit log of received webhook deliveries. Idempotent on
 * `delivery_id` — GitHub retries reuse the same UUID, so we
 * use INSERT ... ON CONFLICT DO NOTHING and only process the
 * first attempt.
 */
export const githubWebhookEvent = pgTable(
  "github_webhook_event",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    deliveryId: text("delivery_id").notNull().unique(),
    event: text("event").notNull(),
    signalKeysJson: text("signal_keys_json").notNull(),
    receivedAt: bigint("received_at", { mode: "number" }).notNull(),
    processedAt: bigint("processed_at", { mode: "number" }),
    errorMessage: text("error_message"),
  },
  (t) => [
    index("github_webhook_event_received_at_idx").on(t.receivedAt),
  ],
)
