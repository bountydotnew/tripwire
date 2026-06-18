import { eq } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import {
  organizations,
  orgPrCommentPreferences,
  type OrgPrCommentPreferences,
} from "@tripwire/db"

/**
 * Look up the org-scoped PR comment preferences for a GitHub App installation.
 * Returns null when no row exists (callers should fall back to defaults).
 */
export async function loadPrefsForInstallation(
  installationId: number
): Promise<OrgPrCommentPreferences | null> {
  const [org] = await db
    .select({ betterAuthOrgId: organizations.betterAuthOrgId })
    .from(organizations)
    .where(eq(organizations.githubInstallationId, installationId))
    .limit(1)

  if (!org?.betterAuthOrgId) return null

  const [prefs] = await db
    .select()
    .from(orgPrCommentPreferences)
    .where(eq(orgPrCommentPreferences.betterAuthOrgId, org.betterAuthOrgId))
    .limit(1)

  return prefs ?? null
}
