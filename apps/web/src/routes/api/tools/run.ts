import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { organizations, repositories } from "@tripwire/db"
import {
  createContext,
  assertRepoBelongsToOrg,
} from "#/integrations/trpc/init"
import {
  filterToolsForSurface,
  runToolForChat,
  tripwireTools,
} from "@tripwire/tools"

/**
 * Direct tool invocation — runs a chat tool's handler + chatRender without
 * going through the LLM. Used by interactive UI affordances (e.g. the
 * "Score breakdown" button on a UserCard) that want to fetch follow-up
 * data cheaply.
 *
 * Restrictions:
 *   - User must be authenticated.
 *   - Tool must be in the chat surface AND have `directInvokable: true`.
 *     Mutations and tools that should only run after model reasoning are
 *     not invokable this way.
 *   - The caller may pass an explicit `repoId`; otherwise we resolve the
 *     same fallback the chat route uses (first repo owned by the user).
 */
export const Route = createFileRoute("/api/tools/run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await createContext({ headers: request.headers })
        if (!ctx.user) {
          return jsonError(401, "Unauthorized")
        }

        let body: { name?: unknown; args?: unknown; repoId?: unknown }
        try {
          body = (await request.json()) as typeof body
        } catch {
          return jsonError(400, "Invalid JSON body")
        }

        const name = typeof body.name === "string" ? body.name : null
        if (!name) return jsonError(400, "Missing tool name")

        const chatTools = filterToolsForSurface(tripwireTools, "chat")
        const tool = chatTools.find((t) => t.name === name)
        if (!tool) return jsonError(404, `Tool "${name}" not found`)
        if (!tool.directInvokable) {
          return jsonError(403, `Tool "${name}" is not directly invokable`)
        }

        let repoId: string | undefined =
          typeof body.repoId === "string" ? body.repoId : undefined

        if (!ctx.activeOrgId) {
          return jsonError(400, "No active organization")
        }
        const activeOrgId = ctx.activeOrgId

        if (tool.needsRepo !== false) {
          if (!repoId) {
            repoId = await firstRepoInOrg(activeOrgId)
          }
          if (!repoId) {
            return jsonError(400, "No accessible repository")
          }
          try {
            await assertRepoBelongsToOrg(repoId, activeOrgId)
          } catch {
            return jsonError(403, "Repo not accessible")
          }
        }

        const parsed = tool.inputSchema.safeParse(body.args ?? {})
        if (!parsed.success) {
          return jsonError(400, parsed.error.message)
        }

        try {
          const spec = await runToolForChat(tool, parsed.data, {
            userId: ctx.user.id,
            userName: ctx.user.name ?? ctx.user.email ?? undefined,
            orgId: activeOrgId,
            repoId,
          })
          return new Response(JSON.stringify({ ok: true, spec }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          return new Response(JSON.stringify({ ok: false, error: message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          })
        }
      },
    },
  },
})

async function firstRepoInOrg(
  activeOrgId: string
): Promise<string | undefined> {
  const [row] = await db
    .select({ id: repositories.id })
    .from(repositories)
    .innerJoin(organizations, eq(repositories.orgId, organizations.id))
    .where(eq(organizations.betterAuthOrgId, activeOrgId))
    .limit(1)
  return row?.id
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}
