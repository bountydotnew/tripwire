/**
 * AI spend computation using tokenlens for live provider pricing.
 *
 * Tracks real dollar amounts in cents for integer precision in Autumn.
 * Formula: cents = ceil(totalCostUSD * MARKUP * 100)
 *
 * Falls back to hardcoded rates if tokenlens can't reach the catalog,
 * so we never give away free AI when we're still paying the provider.
 */

import { createTokenlens } from "tokenlens";

const tokenlens = createTokenlens({ catalog: "openrouter" });

// pre-warm the catalog cache on import so the first request doesn't cold-start
tokenlens.getModelData({ modelId: "openai/gpt-5.4-mini" }).catch(() => {});

/** 1.25x = 25% margin on top of provider cost */
export const MARKUP = 1.25;

const CENTS_PER_USD = 100;

/**
 * Hardcoded per-token rates for models we use, as a safety net.
 * Slightly above real rates so we never under-charge on fallback.
 * Updated from OpenRouter catalog 2026-04.
 */
const FALLBACK_RATES: Record<string, { input: number; output: number }> = {
	"openai/gpt-5.4-mini":  { input: 0.75e-6, output: 4.5e-6 },
	"openai/gpt-5.4-nano":  { input: 0.20e-6, output: 1.25e-6 },
	"openai/gpt-5.4":       { input: 2.5e-6,  output: 15e-6 },
	"openai/gpt-4o-mini":   { input: 0.15e-6, output: 0.6e-6 },
	"openai/gpt-4o":        { input: 2.5e-6,  output: 10e-6 },
	"openai/o4-mini":       { input: 1.1e-6,  output: 4.4e-6 },
};

function computeFromRates(
	inputRate: number,
	outputRate: number,
	promptTokens: number,
	completionTokens: number,
): { rawCostUsd: number; cents: number } {
	const inputCostUsd = promptTokens * inputRate;
	const outputCostUsd = completionTokens * outputRate;
	const rawCostUsd = inputCostUsd + outputCostUsd;
	const cents = Math.ceil(rawCostUsd * MARKUP * CENTS_PER_USD);
	return { rawCostUsd, cents };
}

/**
 * Compute the cost of a request in cents.
 * Uses tokenlens live pricing, falls back to hardcoded rates.
 */
export async function computeCostCents(
	modelId: string,
	promptTokens: number,
	completionTokens: number,
): Promise<number> {
	// try live pricing first
	try {
		const model = await tokenlens.getModelData({ modelId });
		if (model?.cost) {
			const inputRate = Number(model.cost.prompt ?? model.cost.input ?? 0);
			const outputRate = Number(model.cost.completion ?? model.cost.output ?? 0);

			if (inputRate > 0 || outputRate > 0) {
				const { rawCostUsd, cents } = computeFromRates(inputRate, outputRate, promptTokens, completionTokens);

				console.log([
					`[billing:cost] ${modelId}`,
					`  tokens: ${promptTokens} in / ${completionTokens} out`,
					`  rates: $${inputRate}/token in, $${outputRate}/token out`,
					`  provider: $${rawCostUsd.toFixed(6)} | with ${MARKUP}x: ${cents}c`,
				].join("\n"));

				return cents;
			}
		}
	} catch (err) {
		const errMsg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
		console.warn(`[billing] tokenlens failed for "${modelId}": ${errMsg}`);
	}

	// fallback to hardcoded rates
	const fallback = FALLBACK_RATES[modelId];
	if (fallback) {
		const { rawCostUsd, cents } = computeFromRates(fallback.input, fallback.output, promptTokens, completionTokens);
		console.warn(
			`[billing:fallback] ${modelId} | $${rawCostUsd.toFixed(6)} provider | ${cents}c charged (hardcoded rates)`,
		);
		return cents;
	}

	// unknown model, no rates at all. charge a conservative estimate
	// based on gpt-5.4-mini rates (our default model)
	const safeRates = FALLBACK_RATES["openai/gpt-5.4-mini"]!;
	const { rawCostUsd, cents } = computeFromRates(safeRates.input, safeRates.output, promptTokens, completionTokens);
	console.warn(
		`[billing:fallback] unknown model "${modelId}" | using gpt-5.4-mini rates | $${rawCostUsd.toFixed(6)} | ${cents}c charged`,
	);
	return cents;
}
