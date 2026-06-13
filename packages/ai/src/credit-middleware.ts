/**
 * AI SDK usage tracker that reports dollar-denominated spend (in cents)
 * to Autumn after each chat completes.
 *
 * Uses tokenlens for live provider pricing via the OpenRouter catalog.
 */

import { useRequest as getNitroRequest } from "nitro/context"
import { createLogger as createWideEventLogger, type RequestLogger } from "evlog"
import { createLogger } from "@tripwire/logger"
import { computeCostCents } from "./credit-schema"
import { autumn } from "@tripwire/auth/autumn"

const logger = createLogger("billing")

interface CreditUsageOptions {
  customerId: string
  modelId: string
  userName?: string
  userEmail?: string
  repoId?: string
  usage: {
    inputTokens?: number | { total?: number }
    outputTokens?: number | { total?: number }
  }
}

export async function trackCreditUsage({
  customerId,
  modelId,
  userName,
  userEmail,
  repoId,
  usage,
}: CreditUsageOptions): Promise<void> {
  const promptTokens =
    typeof usage.inputTokens === "number"
      ? usage.inputTokens
      : (usage.inputTokens?.total ?? 0)
  const completionTokens =
    typeof usage.outputTokens === "number"
      ? usage.outputTokens
      : (usage.outputTokens?.total ?? 0)

  if (promptTokens === 0 && completionTokens === 0) {
    logger.info("no tokens recorded, skipping", { modelId, customerId })
    logAi({
      customerId,
      modelId,
      userName,
      userEmail,
      repoId,
      promptTokens,
      completionTokens,
      outcome: "no_tokens",
    })
    return
  }

  const cents = await computeCostCents(modelId, promptTokens, completionTokens)
  const totalTokens = promptTokens + completionTokens

  logger.info("usage tracked", {
    modelId,
    promptTokens,
    completionTokens,
    totalTokens,
    costCents: cents,
  })

  logAi({
    customerId,
    modelId,
    userName,
    userEmail,
    repoId,
    promptTokens,
    completionTokens,
    outcome: "ok",
    costCents: cents,
  })

  if (cents === 0) return

  try {
    await autumn.track({
      customerId,
      featureId: "ai_credits",
      value: cents,
      properties: {
        model: modelId,
        repoId,
        promptTokens,
        completionTokens,
      },
    })
  } catch (err) {
    logger.error("Failed to track usage", err)
  }
}

export function logCreditUsageError({
  customerId,
  modelId,
  userName,
  userEmail,
  repoId,
  error,
}: {
  customerId: string
  modelId: string
  userName?: string
  userEmail?: string
  repoId?: string
  error: unknown
}): void {
  logAi({
    customerId,
    modelId,
    userName,
    userEmail,
    repoId,
    promptTokens: 0,
    completionTokens: 0,
    outcome: "error",
    error,
  })
}

/**
 * Emit a wide event capturing the final AI usage tied to this request.
 *
 * AI completion callbacks can fire after the parent request's wide event is
 * sealed (`log.set()` warns + drops keys). We use `createLogger()` to emit a
 * separate wide event correlated to the parent via `_parentRequestId`.
 */
function logAi({
  customerId,
  modelId,
  userName,
  userEmail,
  repoId,
  promptTokens,
  completionTokens,
  outcome,
  costCents,
  error,
}: {
  customerId: string
  modelId: string
  userName?: string
  userEmail?: string
  repoId?: string
  promptTokens: number
  completionTokens: number
  outcome: "ok" | "no_tokens" | "error"
  costCents?: number
  error?: unknown
}) {
  try {
    const req = getNitroRequest() as
      | {
          context?: {
            log?: RequestLogger
            requestId?: string
          }
        }
      | undefined
    const parentRequestId =
      req?.context?.requestId ??
      (req?.context?.log as unknown as { requestId?: string } | undefined)
        ?.requestId

    const aiLog = createWideEventLogger({
      operation: "ai.usage",
      _parentRequestId: parentRequestId,
      user: {
        id: customerId,
        name: userName,
        email: userEmail,
      },
      ai: {
        model: modelId,
        customerId,
        repoId,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costCents,
        outcome,
      },
    })
    if (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      aiLog.error(err)
    }
    aiLog.emit()
  } catch {
    // No active request scope (e.g. unit test); fall through silently.
  }
}
