import { z } from "zod"

/** One rule's result as persisted in `pipeline_*` event metadata. */
export const ruleEvaluationSchema = z.object({
  rule: z.string(),
  passed: z.boolean(),
  nearMiss: z.boolean().optional(),
  reason: z.string().optional(),
  action: z.string().optional(),
  actual: z.number().optional(),
  threshold: z.number().optional(),
})
export type RuleEvaluationView = z.infer<typeof ruleEvaluationSchema>

const evaluationsMetadataSchema = z.object({
  evaluations: z.array(ruleEvaluationSchema),
})

/** Pull the per-rule evaluations out of an event's (untrusted) jsonb metadata. */
export function extractEvaluations(metadata: unknown): RuleEvaluationView[] {
  const parsed = evaluationsMetadataSchema.safeParse(metadata)
  return parsed.success ? parsed.data.evaluations : []
}

/** pass → success, near-miss → warning, fail → error (for the dot color). */
export function evaluationSeverity(
  e: RuleEvaluationView
): "success" | "warning" | "error" {
  return e.passed ? "success" : e.nearMiss ? "warning" : "error"
}

const workflowResultSchema = z.object({
  enforce: z.boolean().optional(),
  actions: z.array(z.unknown()).optional(),
})

/** Short "N actions · enforced/observed" summary for a workflow_run result. */
export function summarizeWorkflowResult(result: unknown): string {
  const parsed = workflowResultSchema.safeParse(result)
  if (!parsed.success) return ""
  const count = parsed.data.actions?.length ?? 0
  const mode = parsed.data.enforce ? "enforced" : "observed"
  return count > 0 ? `${count} action${count === 1 ? "" : "s"} · ${mode}` : mode
}
