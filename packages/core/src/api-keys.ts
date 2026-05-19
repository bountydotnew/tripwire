/**
 * API key generation, hashing, and verification.
 *
 * Keys use the format: tw_live_<32 random hex chars>
 * Only the SHA-256 hash is stored; the raw key is shown once at creation.
 */

import { createHash, randomBytes } from "node:crypto"
import { eq, and, isNull } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { apiKeys } from "@tripwire/db"

const KEY_PREFIX = "tw_live_"

/** Generate a new API key. Returns both the raw key (show once) and hash (store). */
export function generateApiKey(): {
  raw: string
  hash: string
  prefix: string
} {
  const random = randomBytes(32).toString("hex")
  const raw = `${KEY_PREFIX}${random}`
  const hash = hashKey(raw)
  const prefix = raw.slice(0, 12)
  return { raw, hash, prefix }
}

/** SHA-256 hash a raw API key for storage/lookup. */
export function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex")
}

/** Verify a raw API key and return the key record if valid. */
export async function verifyApiKey(raw: string): Promise<{
  id: string
  orgId: string
  scopes: string
} | null> {
  if (!raw.startsWith(KEY_PREFIX)) return null

  const hash = hashKey(raw)
  const [key] = await db
    .select({
      id: apiKeys.id,
      orgId: apiKeys.orgId,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
      revokedAt: apiKeys.revokedAt,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
    .limit(1)

  if (!key) return null
  if (key.expiresAt && key.expiresAt < new Date()) return null

  // Update last used timestamp (fire-and-forget)
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, key.id))
    .then(() => {})
    .catch(() => {})

  return { id: key.id, orgId: key.orgId, scopes: key.scopes }
}

/** Check if a verified key has a specific scope. */
export function hasScope(scopes: string, required: string): boolean {
  const list = scopes.split(",").map((s) => s.trim())
  return list.includes(required) || list.includes("*")
}
