import { createFileRoute } from "@tanstack/react-router"
import { eq } from "drizzle-orm"
import { db } from "@tripwire/db/client"
import { oauthApplication } from "@tripwire/db"

async function handler({ request }: { request: Request }) {
  const url = new URL(request.url)
  const clientId = url.searchParams.get("client_id")
  if (!clientId) {
    return new Response(JSON.stringify({ error: "client_id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }
  const [row] = await db
    .select({
      name: oauthApplication.name,
      icon: oauthApplication.icon,
    })
    .from(oauthApplication)
    .where(eq(oauthApplication.clientId, clientId))
    .limit(1)
  if (!row) {
    return new Response(JSON.stringify({ error: "unknown client" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    })
  }
  return new Response(JSON.stringify(row), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60",
    },
  })
}

export const Route = createFileRoute("/api/oauth/app-info")({
  server: {
    handlers: {
      GET: handler,
    },
  },
})
