import { z } from "zod"
import type { UIMessage } from "ai"
import { eq, and, desc } from "drizzle-orm"
import { assertRepoOwner, authedProcedure } from "../init"
import { db } from "@tripwire/db/client"
import { conversations } from "@tripwire/db"
import type { TRPCRouterRecord } from "@trpc/server"
import { mergeMessagesPreservingResults } from "#/lib/chat/persistence"
import { asConversationStoredMessages } from "#/lib/chat/conversation-stored"
import { extractChatTitle } from "#/lib/chat/extract-title"

const TITLE_MODEL_FALLBACK = "moonshotai/kimi-k2.6"
import { generateText } from "ai"
import { createOpenRouter } from "@openrouter/ai-sdk-provider"
import { trackCreditUsage } from "@tripwire/ai/credit-middleware"
import { TITLE_SYSTEM_PROMPT } from "@tripwire/ai/prompt"
import { parseCommand } from "#/lib/chat/commands"
import {
  filterToolsForSurface,
  runToolForChat,
  tripwireTools,
} from "@tripwire/tools"

type MessageLike = {
  id?: string
  role?: string
  parts?: Array<{ type?: string; text?: string; content?: string }>
}

function makeUserMessage(text: string) {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text }],
  }
}

function makeToolMessage(opts: {
  toolName: string
  args: Record<string, unknown>
  state: "output-available" | "output-error"
  output?: unknown
  errorText?: string
}) {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [
      {
        type: `tool-${opts.toolName}`,
        toolCallId: crypto.randomUUID(),
        state: opts.state,
        input: opts.args,
        ...(opts.output !== undefined ? { output: opts.output } : {}),
        ...(opts.errorText ? { errorText: opts.errorText } : {}),
      },
    ],
  }
}

function helpMessage() {
  return {
    id: crypto.randomUUID(),
    role: "assistant",
    parts: [
      {
        type: "text",
        text: [
          "**Slash commands**",
          "",
          "**Read**",
          "- `/rules` - Show moderation rules",
          "- `/lists` - Show whitelist and blacklist",
          "- `/events` - Show recent activity",
          "- `/lookup @user` - Investigate a contributor",
          "- `/check @user` - Check list status",
          "",
          "**Moderation**",
          "- `/block @user` - Add to blacklist",
          "- `/unblock @user` - Remove from blacklist",
          "- `/allow @user` - Add to whitelist",
          "- `/disallow @user` - Remove from whitelist",
          "",
          "**Chat**",
          "- `/clear` - Clear conversation",
          "- `/new` - Start a new chat",
        ].join("\n"),
      },
    ],
  }
}

async function upsertMessages(
  chatId: string,
  userId: string,
  repoId: string | undefined | null,
  messages: unknown[],
  title: string
) {
  const stored = asConversationStoredMessages(messages)
  await db
    .insert(conversations)
    .values({
      id: chatId,
      userId,
      repoId: repoId ?? null,
      messages: stored,
      title,
    })
    .onConflictDoUpdate({
      target: conversations.id,
      set: {
        messages: stored,
        ...(title ? { title } : {}),
        updatedAt: new Date(),
      },
      setWhere: eq(conversations.userId, userId),
    })
}

export const chatsRouter = {
  create: authedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        repoId: z.string().uuid().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [conv] = await db
        .insert(conversations)
        .values({
          id: input.id,
          userId: ctx.user.id,
          repoId: input.repoId ?? null,
        })
        .onConflictDoNothing()
        .returning()
      return conv ?? null
    }),

  get: authedProcedure
    .input(z.object({ chatId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.chatId),
            eq(conversations.userId, ctx.user.id)
          )
        )
        .limit(1)
      return conv ?? null
    }),

  saveMessages: authedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        repoId: z.string().uuid().optional(),
        messages: z.array(z.any()),
        title: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Merge with whatever's in DB so server-side tool outputs survive a
      // later save from the client that's still using its stale state.
      const [existing] = await db
        .select({ messages: conversations.messages })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.chatId),
            eq(conversations.userId, ctx.user.id)
          )
        )
        .limit(1)

      const merged = mergeMessagesPreservingResults(
        input.messages,
        existing?.messages ?? []
      )

      await db
        .insert(conversations)
        .values({
          id: input.chatId,
          userId: ctx.user.id,
          repoId: input.repoId ?? null,
          messages: asConversationStoredMessages(merged),
          title: input.title ?? "New chat",
        })
        .onConflictDoUpdate({
          target: conversations.id,
          set: {
            messages: asConversationStoredMessages(merged),
            ...(input.title ? { title: input.title } : {}),
            updatedAt: new Date(),
          },
          setWhere: eq(conversations.userId, ctx.user.id),
        })
    }),

  runSlashCommand: authedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        repoId: z.string().uuid().optional(),
        raw: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const parsed = parseCommand(input.raw)
      if (!parsed) {
        throw new Error("Unknown slash command")
      }

      const { command, args, raw } = parsed
      if (command.requiresArg && !args) {
        throw new Error(
          command.example
            ? `Usage: ${command.example}`
            : `${command.command} requires an argument.`
        )
      }

      const [existing] = await db
        .select({
          repoId: conversations.repoId,
          messages: conversations.messages,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.chatId),
            eq(conversations.userId, ctx.user.id)
          )
        )
        .limit(1)

      const repoId = existing?.repoId ?? input.repoId
      const existingMessages = Array.isArray(existing?.messages)
        ? existing.messages
        : []
      const userMessage = makeUserMessage(raw)
      let appended: unknown[] = [userMessage]

      if (command.kind === "client") {
        if (command.command === "/clear") {
          await upsertMessages(
            input.chatId,
            ctx.user.id,
            repoId,
            [],
            "New chat"
          )
          return { messages: [], replace: true }
        }
        if (command.command === "/new") {
          return { messages: [], replace: false, newChat: true }
        }
        if (command.command === "/help") {
          appended = [...appended, helpMessage()]
        }
      } else if (command.kind === "read") {
        if (!command.tool || !command.buildArgs) {
          throw new Error("Command misconfigured")
        }

        const chatTools = filterToolsForSurface(tripwireTools, "chat")
        const tool = chatTools.find((t) => t.name === command.tool)
        if (!tool) throw new Error(`Tool "${command.tool}" not found`)
        if (!tool.directInvokable) {
          throw new Error(`Tool "${command.tool}" is not directly invokable`)
        }

        let resolvedRepoId = repoId
        if (tool.needsRepo !== false) {
          if (!resolvedRepoId) {
            throw new Error("Select a repository before running this command.")
          }
          await assertRepoOwner(ctx.user.id, resolvedRepoId)
        }

        const toolArgs = command.buildArgs(args)
        const parsedArgs = tool.inputSchema.safeParse(toolArgs)
        if (!parsedArgs.success) throw new Error(parsedArgs.error.message)

        try {
          const spec = await runToolForChat(tool, parsedArgs.data, {
            userId: ctx.user.id,
            userName: ctx.user.name ?? ctx.user.email ?? undefined,
            repoId: resolvedRepoId,
          })
          appended = [
            ...appended,
            makeToolMessage({
              toolName: command.tool,
              args: toolArgs,
              state: "output-available",
              output: spec,
            }),
          ]
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          appended = [
            ...appended,
            makeToolMessage({
              toolName: command.tool,
              args: toolArgs,
              state: "output-error",
              errorText: message,
            }),
          ]
        }
      } else {
        return {
          messages: [userMessage],
          replace: false,
          needsConfirmation: true,
        }
      }

      const nextMessages = [...existingMessages, ...appended]
      const slashSyncTitle = extractChatTitle(nextMessages as UIMessage[])
      await upsertMessages(
        input.chatId,
        ctx.user.id,
        repoId,
        nextMessages,
        slashSyncTitle
      )

      return { messages: appended, replace: false }
    }),

  appendSlashMessages: authedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        repoId: z.string().uuid().optional(),
        messages: z.array(z.any()),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const [existing] = await db
        .select({
          repoId: conversations.repoId,
          messages: conversations.messages,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.id, input.chatId),
            eq(conversations.userId, ctx.user.id)
          )
        )
        .limit(1)

      const knownIds = new Set(
        (Array.isArray(existing?.messages) ? existing.messages : [])
          .map((message) => (message as MessageLike).id)
          .filter((id): id is string => typeof id === "string")
      )
      if (input.messages.length === 0) {
        return
      }
      const append = input.messages.filter((message) => {
        const id = (message as MessageLike).id
        return !id || !knownIds.has(id)
      })
      const existingMessages = Array.isArray(existing?.messages)
        ? existing.messages
        : []
      const nextMessages = [...existingMessages, ...append]
      const appendSyncTitle = extractChatTitle(nextMessages as UIMessage[])
      await upsertMessages(
        input.chatId,
        ctx.user.id,
        existing?.repoId ?? input.repoId,
        nextMessages,
        appendSyncTitle
      )
    }),

  list: authedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        repoId: z.string().uuid().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const conditions = [eq(conversations.userId, ctx.user.id)]
      if (input.repoId) {
        conditions.push(eq(conversations.repoId, input.repoId))
      }
      return db
        .select({
          id: conversations.id,
          title: conversations.title,
          repoId: conversations.repoId,
          createdAt: conversations.createdAt,
          updatedAt: conversations.updatedAt,
        })
        .from(conversations)
        .where(and(...conditions))
        .orderBy(desc(conversations.updatedAt))
        .limit(input.limit)
    }),

  generateTitle: authedProcedure
    .input(
      z.object({
        chatId: z.string().uuid(),
        messageText: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        return { title: null }
      }

      const modelId =
        process.env.TRIPWIRE_TITLE_MODEL ||
        process.env.TRIPWIRE_AI_MODEL ||
        TITLE_MODEL_FALLBACK

      try {
        const openrouter = createOpenRouter({
          apiKey,
          appName: "Tripwire",
          compatibility: "strict",
        })

        const result = await generateText({
          model: openrouter.chat(modelId),
          system: TITLE_SYSTEM_PROMPT,
          prompt: `User message: "${input.messageText.slice(0, 500)}"`,
          maxOutputTokens: 60,
        })

        const raw = result.text
        const title = raw
          .trim()
          .replace(/^["']|["']$/g, "")
          .slice(0, 50)
        if (!title) {
          return { title: null }
        }

        await db
          .update(conversations)
          .set({ title, updatedAt: new Date() })
          .where(
            and(
              eq(conversations.id, input.chatId),
              eq(conversations.userId, ctx.user.id)
            )
          )

        void trackCreditUsage({
          customerId: ctx.user.id,
          modelId,
          usage: result.usage,
        })

        return { title }
      } catch {
        return { title: null }
      }
    }),

  delete: authedProcedure
    .input(z.object({ chatId: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      await db
        .delete(conversations)
        .where(
          and(
            eq(conversations.id, input.chatId),
            eq(conversations.userId, ctx.user.id)
          )
        )
    }),

  deleteAll: authedProcedure.mutation(async ({ ctx }) => {
    await db.delete(conversations).where(eq(conversations.userId, ctx.user.id))
  }),
} satisfies TRPCRouterRecord
