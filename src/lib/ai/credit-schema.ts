/**
 * AI spend computation using tokenlens for live provider pricing.
 *
 * Tracks real dollar amounts in cents for integer precision in Autumn.
 * Formula: cents = ceil(totalCostUSD * MARKUP * 100)
 * Minimum 1 cent per request.
 */

import { computeCostUSD } from "tokenlens";

/** 1.5x = 50% margin on top of provider cost */
export const MARKUP = 1.5;

const CENTS_PER_USD = 100;

/**
 * Compute the cost of a request in cents using tokenlens live pricing.
 * Returns at least 1 cent per request.
 */
export async function computeCostCents(
	modelId: string,
	promptTokens: number,
	completionTokens: number,
): Promise<number> {
	try {
		const costs = await computeCostUSD({
			modelId,
			usage: {
				input_tokens: promptTokens,
				output_tokens: completionTokens,
			},
		});

		const cents = costs.totalTokenCostUSD * MARKUP * CENTS_PER_USD;
		return Math.max(1, Math.ceil(cents));
	} catch (err) {
		if (process.env.NODE_ENV !== "production") {
			console.warn(`[billing] tokenlens cost lookup failed for "${modelId}":`, err);
		}
		// fallback: 1 cent minimum if pricing lookup fails
		return 1;
	}
}
