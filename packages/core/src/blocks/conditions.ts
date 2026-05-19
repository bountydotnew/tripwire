import type { BlockDefinition } from "./index"

export const conditionDefinitions: Record<string, BlockDefinition> = {
  custom: {
    summary: "Compares a data field against a value using an operator.",
    example:
      "Check if score > 50 to split the workflow into pass/fail branches.",
  },
} as const
