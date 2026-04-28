/**
 * TanStack AI ChatMiddleware that tracks token usage and reports
 * dollar-denominated spend (in cents) to Autumn after each chat completes.
 *
 * Uses tokenlens for live provider pricing via the OpenRouter catalog.
 */

import type { ChatMiddleware } from "@tanstack/ai";
import { computeCostCents } from "./credit-schema";
import { autumn } from "#/lib/autumn";

interface CreditMiddlewareOptions {
	customerId: string;
	modelId: string;
}

export function createCreditMiddleware({
	customerId,
	modelId,
}: CreditMiddlewareOptions): ChatMiddleware {
	let totalPromptTokens = 0;
	let totalCompletionTokens = 0;

	return {
		name: "credit-tracking",

		onUsage(_ctx, usage) {
			totalPromptTokens += usage.promptTokens;
			totalCompletionTokens += usage.completionTokens;
			console.log(
				`[billing:iter] +${usage.promptTokens} in / +${usage.completionTokens} out (total: ${totalPromptTokens} in / ${totalCompletionTokens} out)`,
			);
		},

		async onFinish(ctx) {
			if (totalPromptTokens === 0 && totalCompletionTokens === 0) {
				console.log("[billing] no tokens recorded, skipping");
				return;
			}

			const cents = await computeCostCents(modelId, totalPromptTokens, totalCompletionTokens);

			console.log(
				`[billing] ${modelId} | ${totalPromptTokens} input + ${totalCompletionTokens} output = ${cents}c charged`,
			);

			if (cents === 0) return;

			ctx.defer(
				autumn.track({
					customerId,
					featureId: "ai_credits",
					value: cents,
					properties: {
						model: modelId,
						promptTokens: totalPromptTokens,
						completionTokens: totalCompletionTokens,
					},
				}).catch((err) => {
					console.error("[billing] Failed to track usage:", err);
				}),
			);
		},
	};
}
