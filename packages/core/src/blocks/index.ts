export interface BlockDefinition {
  summary: string
  example: string
}

import { triggerDefinitions } from "./triggers"
import { ruleDefinitions } from "./rules"
import { conditionDefinitions } from "./conditions"
import { logicDefinitions } from "./logic"
import { actionDefinitions } from "./actions"
import { delayDefinitions } from "./delays"
import { transformDefinitions } from "./transforms"

const allDefinitions: Record<string, Record<string, BlockDefinition>> = {
  trigger: triggerDefinitions,
  rule: ruleDefinitions,
  condition: conditionDefinitions,
  logic: logicDefinitions,
  action: actionDefinitions,
  delay: delayDefinitions,
  transform: transformDefinitions,
}

export function getBlockDefinition(
  type: string,
  subtype: string
): BlockDefinition | undefined {
  return allDefinitions[type]?.[subtype]
}

export {
  triggerDefinitions,
  ruleDefinitions,
  conditionDefinitions,
  logicDefinitions,
  actionDefinitions,
  delayDefinitions,
  transformDefinitions,
}
