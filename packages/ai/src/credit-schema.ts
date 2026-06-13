/**
 * AI spend computation using tokenlens for live provider pricing.
 *
 * Tracks real dollar amounts in cents for integer precision in Autumn.
 * Formula: cents = ceil(totalCostUSD * MARKUP * 100)
 *
 * Falls back to hardcoded rates if tokenlens can't reach the catalog,
 * so we never give away free AI when we're still paying the provider.
 */

import { createLogger } from "@tripwire/logger"

const logger = createLogger("billing:cost")

// lazy-import tokenlens to avoid tiktoken's __dirname crash in ESM serverless
let _tokenlens: {
  getModelData: (args: {
    modelId: string
  }) => Promise<Record<string, unknown> | undefined>
} | null = null

async function getTokenlens() {
  if (!_tokenlens) {
    const { createTokenlens } = await import("tokenlens")
    _tokenlens = createTokenlens({ catalog: "openrouter" })
  }
  return _tokenlens
}

// pre-warm on first import
getTokenlens()
  .then((tl) =>
    tl.getModelData({ modelId: "openai/gpt-5.4-mini" }).catch(() => {})
  )
  .catch(() => {})

/** 1.25x = 25% margin on top of provider cost */
export const MARKUP = 1.25

const CENTS_PER_USD = 100

/**
 * Hardcoded per-token rates for models we use, as a safety net.
 * Slightly above real rates so we never under-charge on fallback.
 * Updated from OpenRouter catalog 2026-04.
 */
const FALLBACK_RATES: Record<string, { input: number; output: number }> = {
  "openai/gpt-5.4-mini": { input: 0.75e-6, output: 4.5e-6 },
  "openai/gpt-5.4-nano": { input: 0.2e-6, output: 1.25e-6 },
  "openai/gpt-5.4": { input: 2.5e-6, output: 15e-6 },
  "openai/gpt-4o-mini": { input: 0.15e-6, output: 0.6e-6 },
  "openai/gpt-4o": { input: 2.5e-6, output: 10e-6 },
  "openai/o4-mini": { input: 1.1e-6, output: 4.4e-6 },
}

function computeFromRates(
  inputRate: number,
  outputRate: number,
  promptTokens: number,
  completionTokens: number
): { rawCostUsd: number; cents: number } {
  const inputCostUsd = promptTokens * inputRate
  const outputCostUsd = completionTokens * outputRate
  const rawCostUsd = inputCostUsd + outputCostUsd
  const cents = Math.ceil(rawCostUsd * MARKUP * CENTS_PER_USD)
  return { rawCostUsd, cents }
}

/**
 * Compute the cost of a request in cents.
 * Uses tokenlens live pricing, falls back to hardcoded rates.
 */
export async function computeCostCents(
  modelId: string,
  promptTokens: number,
  completionTokens: number
): Promise<number> {
  // try live pricing first
  try {
    const tl = await getTokenlens()
    const model = await tl.getModelData({ modelId })
    if (model?.cost && typeof model.cost === "object") {
      const cost = model.cost as Record<string, unknown>
      const inputRate = Number(cost.prompt ?? cost.input ?? 0)
      const outputRate = Number(cost.completion ?? cost.output ?? 0)

      if (inputRate > 0 || outputRate > 0) {
        const { rawCostUsd, cents } = computeFromRates(
          inputRate,
          outputRate,
          promptTokens,
          completionTokens
        )

        logger.info("priced via tokenlens", {
          modelId,
          promptTokens,
          completionTokens,
          totalTokens: promptTokens + completionTokens,
          inputRate,
          outputRate,
          rawCostUsd,
          cents,
        })

        return cents
      }
    }
  } catch (err) {
    const errMsg =
      err instanceof Error ? `${err.name}: ${err.message}` : String(err)
    logger.warn("tokenlens failed", { modelId, error: errMsg })
  }

  // fallback to hardcoded rates
  const fallback = FALLBACK_RATES[modelId]
  if (fallback) {
    const { rawCostUsd, cents } = computeFromRates(
      fallback.input,
      fallback.output,
      promptTokens,
      completionTokens
    )
    logger.warn("priced via hardcoded fallback rates", {
      modelId,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      rawCostUsd,
      cents,
    })
    return cents
  }

  // unknown model, no rates at all. charge a conservative estimate
  // based on gpt-5.4-mini rates (our default model)
  const safeRates = FALLBACK_RATES["openai/gpt-5.4-mini"]!
  const { rawCostUsd, cents } = computeFromRates(
    safeRates.input,
    safeRates.output,
    promptTokens,
    completionTokens
  )
  logger.warn("unknown model, priced via gpt-5.4-mini rates", {
    modelId,
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    rawCostUsd,
    cents,
  })
  return cents
}
