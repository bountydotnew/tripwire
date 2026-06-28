import { z } from "zod"

/**
 * Zod schemas for the slices of GitHub webhook payloads we read. Webhook
 * bodies arrive as untrusted JSON; these are the single source of truth for
 * "is this payload shaped the way this handler needs" — replacing hand-rolled
 * `typeof`/`isRecord` digging. Schemas validate only the fields a given
 * handler touches and ignore the rest.
 */

const loginSchema = z.object({ login: z.string() })

/** Installation lifecycle (install/uninstall) — fields `handleInstallation` needs. */
export const installationPayloadSchema = z.object({
  action: z.string(),
  installation: z.object({
    id: z.number(),
    account: z.object({
      id: z.number(),
      login: z.string(),
      type: z.string(),
      avatar_url: z.string(),
    }),
  }),
  sender: z.object({ id: z.number(), login: z.string() }),
})

/** Repos added/removed from an existing installation. */
export const installationReposPayloadSchema = z.object({
  action: z.enum(["added", "removed"]),
  installation: z.object({ id: z.number() }),
})

/** `{ repository: { name, owner.login } }` — used to derive repo signal keys. */
export const repoIdentitySchema = z.object({
  repository: z.object({ name: z.string(), owner: loginSchema }),
})

export const senderLoginSchema = z.object({ sender: loginSchema })
export const prAuthorSchema = z.object({
  pull_request: z.object({ user: loginSchema }),
})
export const issueAuthorSchema = z.object({
  issue: z.object({ user: loginSchema }),
})
