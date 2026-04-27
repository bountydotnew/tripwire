/**
 * AI spend computation for token-based billing.
 *
 * Tracks real dollar amounts in cents for integer precision in Autumn.
 * Formula: cents = ceil((inputCost + outputCost) × MARKUP × 100)
 * Minimum 1 cent per request.
 */

/** 1.5x = 50% margin on top of provider cost */
export const MARKUP = 1.5;

const TOKENS_PER_MILLION = 1_000_000;
const CENTS_PER_USD = 100;

interface ModelPricing {
	/** USD per million input tokens */
	inputPerMillion: number;
	/** USD per million output tokens */
	outputPerMillion: number;
}

/**
 * Pricing for models we route through OpenRouter.
 * Sourced from @tanstack/ai-openrouter model-meta.ts.
 */
const MODEL_PRICING: Record<string, ModelPricing> = {
	"openai/gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
	"openai/gpt-4o-mini-2024-07-18": { inputPerMillion: 0.15, outputPerMillion: 0.60 },
	"openai/gpt-4o": { inputPerMillion: 2.50, outputPerMillion: 10.00 },
	"openai/gpt-4.1-nano": { inputPerMillion: 0.10, outputPerMillion: 0.40 },
	"openai/gpt-4.1-mini": { inputPerMillion: 0.40, outputPerMillion: 1.60 },
	"openai/o4-mini": { inputPerMillion: 1.10, outputPerMillion: 4.40 },
	"anthropic/claude-sonnet-4": { inputPerMillion: 3.00, outputPerMillion: 15.00 },
	"anthropic/claude-haiku-4": { inputPerMillion: 0.80, outputPerMillion: 4.00 },
};

const FALLBACK_MODEL = "openai/gpt-4o-mini";

function getPricing(modelId: string): ModelPricing {
	const pricing = MODEL_PRICING[modelId];
	if (pricing) return pricing;

	if (process.env.NODE_ENV !== "production") {
		console.warn(`[billing] Unknown model "${modelId}", falling back to ${FALLBACK_MODEL} pricing`);
	}
	return MODEL_PRICING[FALLBACK_MODEL]!;
}

/**
 * Compute the cost of a request in cents.
 * Returns at least 1 cent per request.
 */
export function computeCostCents(
	modelId: string,
	promptTokens: number,
	completionTokens: number,
): number {
	const pricing = getPricing(modelId);

	const inputCostUsd = (promptTokens / TOKENS_PER_MILLION) * pricing.inputPerMillion;
	const outputCostUsd = (completionTokens / TOKENS_PER_MILLION) * pricing.outputPerMillion;
	const totalCostUsd = inputCostUsd + outputCostUsd;

	const cents = totalCostUsd * MARKUP * CENTS_PER_USD;
	return Math.max(1, Math.ceil(cents));
}
