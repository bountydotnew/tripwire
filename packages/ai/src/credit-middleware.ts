/**
 * TanStack AI ChatMiddleware that tracks token usage and reports
 * dollar-denominated spend (in cents) to Autumn after each chat completes.
 *
 * Uses tokenlens for live provider pricing via the OpenRouter catalog.
 */

import type { ChatMiddleware } from "@tanstack/ai";
import { useRequest } from "nitro/context";
import { createLogger, type RequestLogger } from "evlog";
import { computeCostCents } from "./credit-schema";
import { autumn } from "@tripwire/auth/autumn";

interface CreditMiddlewareOptions {
	customerId: string;
	modelId: string;
	userName?: string;
	userEmail?: string;
	repoId?: string;
}

export function createCreditMiddleware({
	customerId,
	modelId,
	userName,
	userEmail,
	repoId,
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
				logAi({ outcome: "no_tokens" });
				return;
			}

			const cents = await computeCostCents(modelId, totalPromptTokens, totalCompletionTokens);

			console.log(
				`[billing] ${modelId} | ${totalPromptTokens} input + ${totalCompletionTokens} output = ${cents}c charged`,
			);

			logAi({ outcome: "ok", costCents: cents });

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

	/**
	 * Emit a wide event capturing the final AI usage tied to this request.
	 *
	 * onFinish fires AFTER the SSE response is streamed, by which point the
	 * parent request's wide event is sealed (`log.set()` warns + drops keys).
	 * We use `createLogger()` to emit a SEPARATE wide event correlated to
	 * the parent via `_parentRequestId`. Drains receive both events.
	 */
	function logAi(extra: { outcome: "ok" | "no_tokens" | "error"; costCents?: number; error?: unknown }) {
		try {
			const req = useRequest() as
				| {
						context?: {
							log?: RequestLogger;
							requestId?: string;
						};
				  }
				| undefined;
			const parentRequestId =
				req?.context?.requestId ??
				(req?.context?.log as unknown as { requestId?: string } | undefined)?.requestId;

			const aiLog = createLogger({
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
					promptTokens: totalPromptTokens,
					completionTokens: totalCompletionTokens,
					totalTokens: totalPromptTokens + totalCompletionTokens,
					costCents: extra.costCents,
					outcome: extra.outcome,
				},
			});
			if (extra.error) {
				const err =
					extra.error instanceof Error
						? extra.error
						: new Error(String(extra.error));
				aiLog.error(err);
			}
			aiLog.emit();
		} catch {
			// No active request scope (e.g. unit test) — fall through silently.
		}
	}
}
