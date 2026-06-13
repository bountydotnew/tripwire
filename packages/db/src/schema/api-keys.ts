import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core"
import { user } from "./auth"

/**
 * API keys for programmatic access to Tripwire's public API.
 *
 * Owned by a USER, not an organization. A single user can use one key
 * across every org they belong to — this matches the mental model of
 * "developers": you, the human, want one secret to script Tripwire with.
 * Cross-org data isolation is enforced inside each API endpoint via the
 * caller's active org (or an explicit org id on the request), not by
 * the key itself.
 *
 * The raw key is shown once at creation; only the hash is stored.
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * Owning user. Was previously a side audit field on org-owned keys;
     * after the user-scoped migration this is the only ownership pointer.
     * Cascade on user delete so a deleted account's keys vanish.
     */
    userId: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Human-readable label (e.g. "CI pipeline", "Vouched app") */
    name: text("name").notNull(),
    /** SHA-256 hash of the raw key — never store the plaintext */
    keyHash: text("key_hash").notNull().unique(),
    /** First 8 chars of the key for display (e.g. "tw_live_a1b2...") */
    keyPrefix: text("key_prefix").notNull(),
    /** Comma-separated scopes: "vouches:read", "vouches:write", etc. */
    scopes: text("scopes").notNull().default("vouches:read"),
    lastUsedAt: timestamp("last_used_at"),
    expiresAt: timestamp("expires_at"),
    revokedAt: timestamp("revoked_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("api_keys_user_idx").on(t.userId),
    index("api_keys_hash_idx").on(t.keyHash),
  ]
)
