import { db } from "#/db";
import { events, type EventAction, type EventSeverity, type EventContentType } from "#/db/schema";

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
	} catch (err) {
		// Event logging should never break the main flow
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
	} catch (err) {
		console.error("[Events] Failed to log batch events:", err);
	}
}
