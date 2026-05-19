import { createAuthClient } from "better-auth/react"
import { organizationClient, adminClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [organizationClient(), adminClient()],
})

/** `useSession().data` — use `import type` in presentational components. */
export type AuthClientSession = ReturnType<typeof authClient.useSession>["data"]
