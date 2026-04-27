/**
 * TanStack AI ChatMiddleware that tracks token usage and reports
 * dollar-denominated spend (in cents) to Autumn after each chat completes.
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
		},

		onFinish(ctx) {
			if (totalPromptTokens === 0 && totalCompletionTokens === 0) return;

			const cents = computeCostCents(modelId, totalPromptTokens, totalCompletionTokens);

			if (process.env.NODE_ENV !== "production") {
				console.log(
					`[billing] ${totalPromptTokens} in + ${totalCompletionTokens} out → ${cents}¢ [${modelId}]`,
				);
			}

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
