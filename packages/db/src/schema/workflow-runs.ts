import { sql } from "drizzle-orm"
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core"
import { user } from "./auth"
import { repositories } from "./installations"
import { workflows } from "./workflows"

export type WorkflowRunStatus = "queued" | "running" | "completed" | "failed"
export type WorkflowRunTrigger = "manual" | "schedule"

/**
 * One execution of a workflow. In-flight dedupe is server-enforced with a
 * partial unique index on (workflow_id, repo_id, pull_number) for
 * queued/running rows. Use pull_number = -1 for repo-wide manual runs;
 * set to a GitHub PR number when the run is scoped to a specific PR.
 */
export const workflowRuns = pgTable(
  "workflow_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repositories.id, { onDelete: "cascade" }),
    /** -1 = not tied to a PR (repo-wide dedupe scope); else GitHub PR number */
    pullNumber: integer("pull_number").notNull().default(-1),
    status: text("status").$type<WorkflowRunStatus>().notNull(),
    triggerKind: text("trigger_kind")
      .$type<WorkflowRunTrigger>()
      .notNull()
      .default("manual"),
    requestedByUserId: text("requested_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    targetUsername: text("target_username").notNull(),
    result: jsonb("result").$type<Record<string, unknown>>(),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
  },
  (t) => [
    index("workflow_runs_workflow_idx").on(t.workflowId),
    index("workflow_runs_repo_idx").on(t.repoId),
    index("workflow_runs_status_idx").on(t.status),
    uniqueIndex("workflow_runs_inflight_dedupe")
      .on(t.workflowId, t.repoId, t.pullNumber)
      .where(sql`${t.status} IN ('queued', 'running')`),
  ]
)
