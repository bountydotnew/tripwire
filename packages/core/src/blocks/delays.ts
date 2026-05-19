import type { BlockDefinition } from "./index"

export const delayDefinitions: Record<string, BlockDefinition> = {
  wait: {
    summary: "Pauses the workflow for a set duration before continuing.",
    example: "Wait 5 minutes before re-checking a contributor's profile data.",
  },
} as const
