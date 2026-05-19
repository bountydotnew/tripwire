// Shared AI model configuration — importable from both server and client.
// No async deps, no tokenlens, no env imports.

export const AI_MODEL_ID = "openai/gpt-5.4"
export const AI_MODEL_CONTEXT_WINDOW = 200_000

// Per-token rates (USD) for cost estimation. Same source as credit-schema fallbacks.
export const MODEL_RATES: Record<
  string,
  { input: number; output: number; contextWindow: number }
> = {
  "openai/gpt-5.4-mini": {
    input: 0.75e-6,
    output: 4.5e-6,
    contextWindow: 200_000,
  },
  "openai/gpt-5.4-nano": {
    input: 0.2e-6,
    output: 1.25e-6,
    contextWindow: 128_000,
  },
  "openai/gpt-5.4": { input: 2.5e-6, output: 15e-6, contextWindow: 200_000 },
  "openai/gpt-4o-mini": {
    input: 0.15e-6,
    output: 0.6e-6,
    contextWindow: 128_000,
  },
  "openai/gpt-4o": { input: 2.5e-6, output: 10e-6, contextWindow: 128_000 },
  "openai/o4-mini": { input: 1.1e-6, output: 4.4e-6, contextWindow: 200_000 },
}

export function estimateCostUSD(
  modelId: string,
  inputTokens: number,
  outputTokens: number
): number {
  const input = Math.max(0, inputTokens || 0)
  const output = Math.max(0, outputTokens || 0)
  const rates = MODEL_RATES[modelId] ?? MODEL_RATES[AI_MODEL_ID]
  if (!rates) return 0
  return input * rates.input + output * rates.output
}

export function getContextWindow(modelId: string): number {
  return MODEL_RATES[modelId]?.contextWindow ?? AI_MODEL_CONTEXT_WINDOW
}
