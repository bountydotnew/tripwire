import { createFileRoute } from "@tanstack/react-router"
import {
  ensureDevLoginUser,
  seedDevWorkspace,
  signInDevLoginUser,
} from "#/lib/dev-seed"

async function postDevLogin({ request }: { request: Request }) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Not found" }, { status: 404 })
  }

  await ensureDevLoginUser(request.headers)
  await seedDevWorkspace()

  return signInDevLoginUser(request.headers)
}

export const Route = createFileRoute("/api/dev/login")({
  server: {
    handlers: {
      POST: postDevLogin,
    },
  },
})
