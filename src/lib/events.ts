import { db } from "#/db";
import { events, githubReputation, type EventAction, type EventSeverity, type EventContentType } from "#/db/schema";
import { sql } from "drizzle-orm";

interface LogEventOptions {
	repoId: string;
	action: EventAction;
	severity?: EventSeverity;
	description?: string;
	contentType?: EventContentType;
	pipelineId?: string;
	ruleName?: string;
	targetGithubUsername?: string;
	targetGithubUserId?: number;
	githubRef?: string;
	metadata?: Record<string, unknown>;
}

/**
 * Log an event to the activity feed.
 *
 * @example
 * // Pipeline allowed
 * await logEvent({
 *   repoId: repo.id,
 *   action: "pipeline_allowed",
 *   severity: "success",
 *   description: "@octocat passed all 5 enabled rules",
 *   contentType: "pull_request",
 *   pipelineId: "abc-123",
 *   targetGithubUsername: "octocat",
 *   githubRef: "#42",
 * });
 *
 * @example
 * // Near-miss warning
 * await logEvent({
 *   repoId: repo.id,
 *   action: "rule_near_miss",
 *   severity: "warning",
 *   description: "@octocat has 17 merged PRs (threshold: 15)",
 *   ruleName: "minMergedPrs",
 *   targetGithubUsername: "octocat",
 *   metadata: { actual: 17, threshold: 15, ratio: 1.13 },
 * });
 */
export async function logEvent(options: LogEventOptions) {
	try {
		await db.insert(events).values({
			repoId: options.repoId,
			action: options.action,
			severity: options.severity ?? "info",
			description: options.description,
			contentType: options.contentType,
			pipelineId: options.pipelineId,
			ruleName: options.ruleName,
			targetGithubUsername: options.targetGithubUsername,
			targetGithubUserId: options.targetGithubUserId,
			githubRef: options.githubRef,
			metadata: options.metadata,
		});

		updateReputation(options).catch(() => {});
	} catch (err) {
		console.error("[Events] Failed to log event:", err);
	}
}

/**
 * Log multiple events in a single batch (used after pipeline evaluation).
 */
export async function logEvents(eventList: LogEventOptions[]) {
	if (eventList.length === 0) return;

	try {
		await db.insert(events).values(
			eventList.map((e) => ({
				repoId: e.repoId,
				action: e.action,
				severity: e.severity ?? "info",
				description: e.description,
				contentType: e.contentType,
				pipelineId: e.pipelineId,
				ruleName: e.ruleName,
				targetGithubUsername: e.targetGithubUsername,
				targetGithubUserId: e.targetGithubUserId,
				githubRef: e.githubRef,
				metadata: e.metadata,
			})),
		);

		// Update reputation for each pipeline event in the batch
		for (const e of eventList) {
			updateReputation(e).catch(() => {});
		}
	} catch (err) {
		console.error("[Events] Failed to log batch events:", err);
	}
}

// ─── Reputation tracking ─────────────────────────────────────

const REPUTATION_ACTIONS = new Set<string>([
	"pipeline_blocked",
	"pipeline_allowed",
	"rule_near_miss",
]);

async function updateReputation(options: LogEventOptions) {
	if (!options.targetGithubUsername) return;
	if (!REPUTATION_ACTIONS.has(options.action)) return;

	const username = options.targetGithubUsername.toLowerCase();
	const isBlock = options.action === "pipeline_blocked";
	const isAllow = options.action === "pipeline_allowed";
	const isNearMiss = options.action === "rule_near_miss";

	try {
		await db
			.insert(githubReputation)
			.values({
				githubUsername: username,
				githubUserId: options.targetGithubUserId ?? null,
				totalBlocks: isBlock ? 1 : 0,
				totalAllows: isAllow ? 1 : 0,
				totalNearMisses: isNearMiss ? 1 : 0,
				score: isAllow ? 1 : isBlock ? -3 : -1,
			})
			.onConflictDoUpdate({
				target: githubReputation.githubUsername,
				set: {
					totalBlocks: isBlock
						? sql`${githubReputation.totalBlocks} + 1`
						: githubReputation.totalBlocks,
					totalAllows: isAllow
						? sql`${githubReputation.totalAllows} + 1`
						: githubReputation.totalAllows,
					totalNearMisses: isNearMiss
						? sql`${githubReputation.totalNearMisses} + 1`
						: githubReputation.totalNearMisses,
					score: sql`${githubReputation.totalAllows}${isAllow ? sql` + 1` : sql``} - (${githubReputation.totalBlocks}${isBlock ? sql` + 1` : sql``}) * 3 - (${githubReputation.totalNearMisses}${isNearMiss ? sql` + 1` : sql``})`,
					githubUserId: options.targetGithubUserId ?? sql`${githubReputation.githubUserId}`,
					lastSeenAt: new Date(),
					updatedAt: new Date(),
				},
			});
	} catch (err) {
		console.error("[Events] Failed to update reputation:", err);
	}
}
