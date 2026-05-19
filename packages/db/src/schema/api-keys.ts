import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { organizations } from "./installations"
import { user } from "./auth"

/**
 * API keys for programmatic access to Tripwire's public API.
 *
 * Keys are scoped to an organization and can have fine-grained permissions.
 * The raw key is shown once at creation; only the hash is stored.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** Human-readable label (e.g. "CI pipeline", "Vouched app") */
    name: text("name").notNull(),
    /** SHA-256 hash of the raw key — never store the plaintext */
    keyHash: text("key_hash").notNull().unique(),
    /** First 8 chars of the key for display (e.g. "tw_live_a1b2...") */
    keyPrefix: text("key_prefix").notNull(),
    /** Comma-separated scopes: "vouches:read", "vouches:write", etc. */
    scopes: text("scopes").notNull().default("vouches:read"),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("api_keys_org_idx").on(t.orgId),
    index("api_keys_hash_idx").on(t.keyHash),
  ]
)
