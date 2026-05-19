import type { BlockDefinition } from "./index"

export const logicDefinitions: Record<string, BlockDefinition> = {
  AND: {
    summary: "Passes only when all connected inputs pass.",
    example: "Connect Account Age + Merged PRs to require both checks.",
  },
  OR: {
    summary: "Passes when any connected input passes.",
    example: "Connect Whitelist + Score Check so either one grants access.",
  },
  NOT: {
    summary: "Inverts the result of its input.",
    example: "Flip a passing rule into a fail condition for exclusion logic.",
  },
} as const
