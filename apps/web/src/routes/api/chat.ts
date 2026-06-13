import { createFileRoute } from "@tanstack/react-router"
import {
  consumeStream,
  convertToModelMessages,
  stepCountIs,
  streamText,
  type UIMessage,
} from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { useRequest as getNitroRequest } from "nitro/context"
import type { RequestLogger } from "evlog"
import { createLogger } from "@tripwire/logger"
import { createChatTools, tripwireTools } from "@tripwire/tools"

const logger = createLogger("chat")
import {
  logCreditUsageError,
  trackCreditUsage,
} from "@tripwire/ai/credit-middleware"
import { buildSystemPrompt } from "@tripwire/ai"
import { memoryProvider } from "@tripwire/ai/memory"
import { createTripwireAgent } from "@tripwire/ai/agent"
import { createContext } from "#/integrations/trpc/init"
import { assertRepoBelongsToOrg } from "@tripwire/core"
import { auth } from "@tripwire/auth"
import { autumn } from "@tripwire/auth/autumn"
import { db } from "@tripwire/db/client"
import {
  conversations,
  member,
  organizations,
  repositories,
  type ConversationStoredMessage,
} from "@tripwire/db"
import { and, eq } from "drizzle-orm"
import type { ProviderError } from "#/types/chat"
import { asConversationStoredMessages } from "#/lib/chat/conversation-stored"
import {
  mergeClientMessagesWithStored,
  sanitizeMessages,
} from "#/lib/chat/server"

function isCustomerNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false
  const e = err as Record<string, unknown>
  const body = e.body as Record<string, unknown> | undefined
  const msg = typeof e.message === "string" ? e.message : ""
  return (
    e.statusCode === 404 ||
    e.code === "customer_not_found" ||
    body?.code === "customer_not_found" ||
    msg.includes("not found")
  )
}

type AutumnQuotaCheck = Awaited<ReturnType<typeof autumn.check>>

function chatApiErrorFields(error: unknown): {
  errMsg: string
  provider?: string
  raw?: unknown
} {
  const pe = error as ProviderError & { message?: string }
  const errMsg = pe?.error?.message ?? pe?.message ?? "Unknown error"
  const provider = pe?.error?.metadata?.provider_name
  const raw = pe?.error?.metadata?.raw
  return { errMsg, provider, raw }
}

function getRequestLog(): RequestLogger | undefined {
  try {
    const req = getNitroRequest() as
      | { context?: { log?: RequestLogger } }
      | undefined
    return req?.context?.log
  } catch {
    return undefined
  }
}

async function resolveRepoIdForUser(
  userId: string
): Promise<string | undefined> {
  const userOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.ownerId, userId))

  for (const org of userOrgs) {
    const [firstRepo] = await db
      .select({ id: repositories.id })
      .from(repositories)
      .where(eq(repositories.orgId, org.id))
      .limit(1)
    if (firstRepo?.id) return firstRepo.id
  }
  return undefined
}

function jsonError(
  status: number,
  body: Record<string, unknown>,
  extraHeaders?: Record<string, string>
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  })
}

/**
 * Autumn quota check, keyed to the active org. We create the customer
 * lazily on first request so the flip to per-org billing doesn't require
 * a sweep over every existing org.
 */
async function checkQuota(orgId: string) {
  try {
    return await autumn.check({
      customerId: orgId,
      featureId: "ai_credits",
      withPreview: true,
    })
  } catch (checkErr: unknown) {
    if (!isCustomerNotFoundError(checkErr)) throw checkErr
    await autumn.customers.getOrCreate({ customerId: orgId })
    return autumn.check({
      customerId: orgId,
      featureId: "ai_credits",
      withPreview: true,
    })
  }
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ctx = await createContext({ headers: request.headers })
        if (!ctx.user) return jsonError(401, { error: "Unauthorized" })
        const user = ctx.user

        // The active org is the billing subject — Autumn charges credits
        // to its customer (the org), not to the signed-in user. The
        // session row carries `activeOrganizationId` once Better Auth's
        // `setActive` has run, but new sessions and users who haven't
        // switched orgs yet have it null. Fall back to the user's first
        // org membership so the chat works on first sign-in, before the
        // client's reconciliation effect propagates.
        const session = await auth.api.getSession({ headers: request.headers })
        let activeOrgId = session?.session?.activeOrganizationId ?? null
        if (!activeOrgId) {
          const [firstMembership] = await db
            .select({ organizationId: member.organizationId })
            .from(member)
            .where(eq(member.userId, user.id))
            .limit(1)
          activeOrgId = firstMembership?.organizationId ?? null
        }
        if (!activeOrgId) {
          return jsonError(400, {
            error: "no_active_org",
            message: "Switch to a workspace before chatting.",
          })
        }

        try {
          let quota: AutumnQuotaCheck
          try {
            quota = await checkQuota(activeOrgId)
          } catch (checkErr) {
            // Autumn down/misconfigured: fail closed rather than grant free credits.
            logger.error("Autumn check failed, denying request", checkErr)
            return jsonError(429, {
              error: "quota_check_failed",
              code: "quota_check_failed",
              message: "Could not verify your AI credits. Try again shortly.",
            })
          }

          if (!quota?.allowed) {
            const quotaRecord = quota as Record<string, unknown>
            const code =
              typeof quotaRecord.code === "string"
                ? quotaRecord.code
                : "usage_limit"
            return jsonError(
              429,
              {
                error: "quota_exhausted",
                code,
                message:
                  code === "usage_limit"
                    ? "You've used all your AI credits this month."
                    : "AI chat is not included in your current plan.",
              },
              { "X-Quota-Code": code }
            )
          }

          const {
            messages: rawMessages,
            repoId,
            conversationId,
            currentPage,
          } = await request.json()

          // If the client supplied a conversationId AND a row already exists for it,
          // verify the row belongs to this user. Without this check the endpoint
          // trusts the body, so a user could attach their messages to someone else's
          // chat. New chats race with trpc.chats.create so the row may not exist
          // yet; only block when the row exists and is owned by a different user.
          let existingConversation:
            | {
                userId: string
                repoId: string | null
                messages: ConversationStoredMessage[]
              }
            | undefined
          if (conversationId && typeof conversationId === "string") {
            const [existing] = await db
              .select({
                userId: conversations.userId,
                organizationId: conversations.organizationId,
                repoId: conversations.repoId,
                messages: conversations.messages,
              })
              .from(conversations)
              .where(eq(conversations.id, conversationId))
              .limit(1)
            existingConversation = existing
            if (
              existing &&
              (existing.userId !== user.id ||
                existing.organizationId !== activeOrgId)
            ) {
              return jsonError(403, { error: "conversation_not_accessible" })
            }
          }

          // Client-sent repoId wins. The conversation row's stored
          // repoId is informational (last-used) and only a fallback
          // when the client didn't send one — e.g. a stale tab where
          // workspace context hasn't hydrated yet. This lets the agent
          // track the user's CURRENT workspace repo across turns, so
          // mid-chat repo switches get reflected in the system prompt
          // and tool calls.
          const resolvedRepoId =
            (repoId as string | undefined) ??
            existingConversation?.repoId ??
            (await resolveRepoIdForUser(user.id))

          if (!resolvedRepoId) {
            return jsonError(400, {
              error:
                "No repositories available. Connect a repository to start chatting.",
            })
          }

          try {
            await assertRepoBelongsToOrg(resolvedRepoId, activeOrgId)
          } catch {
            return jsonError(403, {
              error: "repo_not_in_active_org",
              message: "This repository isn't in your active workspace.",
            })
          }

          const [repo] = await db
            .select()
            .from(repositories)
            .where(eq(repositories.id, resolvedRepoId))
            .limit(1)

          let systemPrompt = buildSystemPrompt({
            repoName: repo?.fullName ?? "Unknown Repository",
            userName: user.name ?? user.email ?? "User",
            currentPage: currentPage ?? "/home",
          })

          // Per-chat scope (not "user") because chatId is already
          // org-scoped via the per-org localStorage slot in
          // providers/chat-context.tsx. "user" scope would leak working
          // memory across orgs for the same signed-in user.
          const wm = await memoryProvider
            .getWorkingMemory({
              userId: user.id,
              chatId: conversationId,
              scope: "chat",
            })
            .catch(() => null)
          if (wm?.content) {
            systemPrompt += `\n\n<working-memory>\n${wm.content}\n</working-memory>`
          }

          const aiModel = process.env.TRIPWIRE_AI_MODEL || "openai/gpt-5.4"

          getRequestLog()?.set({
            ai: {
              model: aiModel,
              conversationId,
              repoId: resolvedRepoId,
              currentPage: currentPage ?? "/home",
            },
          })

          const tools = createChatTools(
            {
              userId: user.id,
              userName: user.name ?? user.email ?? "User",
              orgId: activeOrgId,
              repoId: resolvedRepoId,
            },
            tripwireTools
          )

          const mergedMessages = mergeClientMessagesWithStored(
            Array.isArray(rawMessages) ? rawMessages : [],
            existingConversation?.messages ?? []
          )

          if (typeof conversationId === "string" && existingConversation) {
            await db
              .update(conversations)
              .set({
                messages: asConversationStoredMessages(mergedMessages),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(conversations.id, conversationId),
                  eq(conversations.userId, user.id),
                  eq(conversations.organizationId, activeOrgId)
                )
              )
              .catch((err) => {
                logger.error("Failed to persist approval cleanup", err)
              })
          }

          const messages = sanitizeMessages(mergedMessages, tools)
          const modelMessages = await convertToModelMessages(
            messages.map(({ id: _id, ...message }) => message),
            { tools, ignoreIncompleteToolCalls: true }
          )

          if (process.env.NODE_ENV !== "production") {
            const summary = messages
              .map((m: UIMessage, i: number) => {
                const parts =
                  m.parts
                    ?.map((p) => {
                      const pt = p as Record<string, unknown>
                      const id = pt.toolCallId ?? pt.id
                      const idStr = id ? `(${String(id).slice(0, 8)})` : ""
                      const nameStr =
                        typeof pt.name === "string" ? `:${pt.name}` : ""
                      const stateStr =
                        typeof pt.state === "string" ? `[${pt.state}]` : ""
                      const ty = typeof pt.type === "string" ? pt.type : "?"
                      return `${ty}${idStr}${nameStr}${stateStr}`
                    })
                    .join(", ") ?? "no-parts"
                return `  [${i}] ${m.role}: ${parts}`
              })
              .join("\n")
            logger.debug("messages dump", { count: messages.length, summary })
          }

          const openrouter = createOpenRouter({
            apiKey: process.env.OPENROUTER_API_KEY,
            appName: "Tripwire",
            compatibility: "strict",
          })

          const orModel = openrouter.chat(aiModel, {
            plugins: [{ id: "web", max_results: 3 }],
          })

          if (process.env.TRIPWIRE_USE_AGENT === "true") {
            const lastUserMessage = messages
              .filter((m: UIMessage) => m.role === "user")
              .pop()
            if (!lastUserMessage) {
              return jsonError(400, { error: "No user message found" })
            }
            const agent = createTripwireAgent({
              model: orModel,
              tools,
              systemPrompt,
              userId: user.id,
              userName: user.name ?? user.email ?? "User",
              userEmail: user.email ?? undefined,
              conversationId:
                typeof conversationId === "string" ? conversationId : "",
              repoId: resolvedRepoId,
              modelId: aiModel,
            })
            return agent.toUIMessageStream(lastUserMessage)
          }

          const result = streamText({
            model: orModel,
            messages: modelMessages,
            tools,
            system: systemPrompt,
            stopWhen: stepCountIs(10),
            abortSignal: request.signal,
            onFinish: async ({ totalUsage }) => {
              await trackCreditUsage({
                customerId: activeOrgId,
                modelId: aiModel,
                userName: user.name ?? undefined,
                userEmail: user.email ?? undefined,
                repoId: resolvedRepoId,
                usage: totalUsage,
              })
            },
            onError: ({ error }) => {
              logCreditUsageError({
                customerId: activeOrgId,
                modelId: aiModel,
                userName: user.name ?? undefined,
                userEmail: user.email ?? undefined,
                repoId: resolvedRepoId,
                error,
              })
              const err = error as ProviderError
              const raw =
                err?.error?.metadata?.raw ??
                err?.error?.message ??
                err?.message ??
                "Unknown"
              logger.error("stream error", {
                raw: typeof raw === "string" ? raw : JSON.stringify(raw),
              })
            },
          })

          return result.toUIMessageStreamResponse({
            originalMessages: messages,
            messageMetadata: ({ part }) => {
              if (part.type === "finish") {
                return {
                  usage: part.totalUsage,
                  modelId: aiModel,
                }
              }
              return undefined
            },
            onFinish: async ({ messages: finishedMessages }) => {
              if (typeof conversationId !== "string") return

              const persistConversation = db
                .insert(conversations)
                .values({
                  id: conversationId,
                  userId: user.id,
                  organizationId: activeOrgId,
                  repoId: resolvedRepoId,
                  messages: asConversationStoredMessages(finishedMessages),
                  title: "New chat",
                })
                .onConflictDoUpdate({
                  target: conversations.id,
                  set: {
                    messages: asConversationStoredMessages(finishedMessages),
                    repoId: resolvedRepoId,
                    updatedAt: new Date(),
                  },
                  setWhere: and(
                    eq(conversations.userId, user.id),
                    eq(conversations.organizationId, activeOrgId)
                  ),
                })
                .catch((err) => {
                  logger.error("Failed to persist server stream", err)
                })

              const persistMemory = Promise.all(
                finishedMessages.slice(-2).map((msg) => {
                  const textParts =
                    msg.parts
                      ?.filter(
                        (p): p is { type: "text"; text: string } =>
                          (p as Record<string, unknown>).type === "text"
                      )
                      .map((p) => p.text)
                      .join("") ?? ""
                  return memoryProvider
                    .saveMessage({
                      chatId: conversationId,
                      userId: user.id,
                      role: msg.role as "user" | "assistant" | "system",
                      content: textParts || JSON.stringify(msg.parts),
                      timestamp: new Date(),
                    })
                    .catch((err: unknown) => {
                      logger.error("Failed to persist memory message", err)
                    })
                })
              )

              await Promise.all([persistConversation, persistMemory])
            },
            consumeSseStream: consumeStream,
          })
        } catch (error: unknown) {
          const { errMsg, provider, raw } = chatApiErrorFields(error)
          logger.error("API error", { provider, errMsg, raw })
          getRequestLog()?.set({
            ai: { outcome: "error", provider, errorMessage: errMsg },
          })
          getRequestLog()?.error(
            error instanceof Error ? error : new Error(errMsg)
          )
          return jsonError(500, { error: errMsg })
        }
      },
    },
  },
})
