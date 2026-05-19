import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core"
import { repositories } from "./installations"

export type CustomRuleNodeType = "condition" | "logic" | "transform"

export interface CustomRuleNode {
  id: string
  type: CustomRuleNodeType
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface CustomRuleEdge {
  id: string
  source: string
  target: string
  sourceHandle?: string | null
  targetHandle?: string | null
  label?: string
  animated?: boolean
}

export interface CustomRuleDefinition {
  nodes: CustomRuleNode[]
  edges: CustomRuleEdge[]
  outputNodeId: string
}

export type CustomRuleAction = "block" | "warn" | "log" | "threshold"

export interface CustomRuleScopeOverride {
  pullRequests?: boolean
  issues?: boolean
  comments?: boolean
}

export const customRules = pgTable(
  "custom_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    definition: jsonb("definition").$type<CustomRuleDefinition>().notNull(),
    action: text("action").$type<CustomRuleAction>().notNull(),
    thresholdCount: integer("threshold_count"),
    scopeOverride: jsonb("scope_override").$type<CustomRuleScopeOverride>(),
    enabled: boolean("enabled").notNull().default(false),
    simulatedAt: timestamp("simulated_at"),
    priority: integer("priority").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("custom_rules_repo_idx").on(t.repoId),
    index("custom_rules_repo_enabled_idx").on(t.repoId, t.enabled),
  ]
)
