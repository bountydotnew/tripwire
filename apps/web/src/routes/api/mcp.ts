import { createFileRoute } from "@tanstack/react-router"
import { createMcpHandler } from "mcp-handler"
import { withMcpAuth } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import { auth } from "@tripwire/auth"
import { db } from "@tripwire/db/client"
import { member } from "@tripwire/db"
import { registerMcpTools, SERVER_INSTRUCTIONS } from "@tripwire/mcp"
import { tripwireTools } from "@tripwire/tools"

/**
 * Resolve the org an MCP request should be scoped to. OAuth access
 * tokens don't carry `activeOrganizationId` (it's a session concept,
 * not a token-level one), so we pick the calling user's earliest org
 * membership as a deterministic fallback. Users with multiple orgs who
 * want to scope MCP differently can drop the user-token approach in
 * favor of per-org service tokens once we ship that.
 */
async function resolveMcpOrgId(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ organizationId: member.organizationId })
    .from(member)
    .where(eq(member.userId, userId))
    .orderBy(member.createdAt)
    .limit(1)
  return row?.organizationId ?? null
}

const handler = withMcpAuth(auth, (req, session) =>
  createMcpHandler(
    async (server) => {
      const orgId = await resolveMcpOrgId(session.userId)
      if (!orgId) {
        throw new Error(
          "No organization found for this user — create one before using MCP."
        )
      }
      registerMcpTools(server, session.userId, orgId, tripwireTools)
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    },
    {
      basePath: "/api",
      verboseLogs: false,
      maxDuration: 60,
    }
  )(req)
)

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: ({ request }) => handler(request),
      DELETE: ({ request }) => handler(request),
    },
  },
})
