/**
 * Fake Bounty Honeypot module.
 *
 * Generates unsolvable "bounty" issues designed to trap automated
 * agents (clankers). When a bot submits a PR or comment referencing
 * a fake bounty, Tripwire:
 *   1. Sends a plausible decline message
 *   2. Records the catch
 *   3. Optionally blacklists the user
 *
 * The issues are crafted to look legitimate to bots while including
 * subtle signals that make them identifiable as traps to humans
 * (e.g., repo description mentions Tripwire, issue body has deliberate
 * contradictions that make the "bug" unsolvable).
 */

import { eq, and, sql } from "drizzle-orm";
import { db } from "@tripwire/db/client";
import {
	fakeBountyConfigs,
	fakeBounties,
	fakeBountyCatches,
	repositories,
	organizations,
} from "@tripwire/db";
import {
	getInstallationToken,
	addComment,
	closePullRequest,
	githubApi,
} from "@tripwire/github";
import { logEvent } from "./events";

// ─── Issue templates ──────────────────────────────────────────

interface BountyTemplate {
	title: string;
	body: string;
}

const BOUNTY_TEMPLATES: BountyTemplate[] = [
	{
		title: "Fix race condition in concurrent request handler",
		body: `## Description

We're seeing intermittent failures in the request handler when processing concurrent requests. The issue appears when two requests arrive within the same event loop tick and both attempt to acquire the shared resource lock.

## Expected behavior
Requests should be processed sequentially when contention is detected.

## Current behavior
Approximately 1 in 500 requests fails with a timeout when under concurrent load. The error occurs in the lock acquisition phase but the stack trace points to the cleanup handler.

## Steps to reproduce
1. Run the load test suite with \`--concurrent=50\`
2. Monitor the error logs for lock timeout messages
3. The failure is non-deterministic but should appear within 2-3 minutes

## Environment
- Node.js 20.x
- Linux (production) / macOS (dev)

## Bounty
Looking for someone to identify and fix the root cause. The fix should handle the edge case without introducing additional latency for non-contended requests.`,
	},
	{
		title: "Optimize database query performance for large datasets",
		body: `## Problem

The dashboard query that aggregates user statistics is taking 8-12 seconds on datasets over 100k rows. We need to bring this under 500ms.

## Current implementation
The query joins three tables and uses a window function for ranking. The execution plan shows a sequential scan on the events table despite having an index on \`created_at\`.

## Requirements
- Query must return the same result set
- Must work with PostgreSQL 15+
- Should not require schema changes that break existing migrations
- The optimization should handle the case where the events table has gaps in the ID sequence

## What we've tried
- Added composite index on (repo_id, created_at) — no improvement
- Rewrote with CTE — marginal improvement (10-11s)
- Materialized view — works but refresh is too slow

## Reward
Substantial bounty for a clean, well-tested solution that meets all requirements.`,
	},
	{
		title: "Implement retry logic for flaky external API integration",
		body: `## Context

Our integration with the external notification service intermittently returns 503 errors. We need robust retry logic that handles:

1. Transient 503 errors (retry with backoff)
2. Rate limit 429 errors (respect Retry-After header)
3. Permanent failures (4xx except 429) should not retry
4. The circuit breaker should open after 5 consecutive failures

## Technical constraints
- The retry must preserve the original request ordering
- Retried requests must use the same idempotency key
- The backoff algorithm should use jitter to avoid thundering herd
- Total retry budget per request: 30 seconds
- The implementation must work with both the sync and async code paths

## Edge case
The API sometimes returns 200 with an error body (legacy behavior). These should be treated as transient failures. The error body format is undocumented but always contains a \`"status": "error"\` field.

## Bounty
Open to contributors. Please include tests covering all the scenarios above.`,
	},
	{
		title: "Fix timezone handling in scheduled task processor",
		body: `## Bug report

Tasks scheduled across DST transitions are executing at the wrong time. A task scheduled for "every day at 9:00 AM EST" shifts by one hour during daylight saving transitions.

## Root cause analysis
The scheduler stores timestamps in UTC and converts to the user's timezone at execution time. The conversion uses a fixed offset rather than IANA timezone rules.

## Requirements
- Fix the timezone conversion to use IANA timezone database
- Handle the "spring forward" gap (2:30 AM doesn't exist)
- Handle the "fall back" overlap (1:30 AM exists twice)
- Existing scheduled tasks must not be disrupted during migration
- The fix should work for all 400+ IANA timezones

## Note
The scheduler's cron parser is custom-built and doesn't support standard cron expressions. Any fix must work within the existing expression format.

## Bounty
Available for contributors familiar with timezone edge cases.`,
	},
	{
		title: "Resolve memory leak in WebSocket connection pool",
		body: `## Issue

The WebSocket server's connection pool grows unbounded under certain conditions. Memory usage increases by ~50MB/hour when clients frequently disconnect and reconnect.

## Investigation
- Heap snapshots show detached DOM nodes (irrelevant for Node.js, but the profiler reports them)
- The connection cleanup handler fires correctly on disconnect
- However, the event listener registry retains references to closed connections
- The leak only manifests when connections are closed from the client side

## Constraints
- The fix cannot change the public API
- Connection metadata must be preserved for audit logging even after disconnect
- The solution must handle the case where a client reconnects with the same session ID before the previous connection is fully cleaned up
- Memory usage should stabilize within 5 minutes of reaching steady state

## Reward
Bounty for identifying the exact leak source and providing a minimal fix with a regression test.`,
	},
];

function pickTemplate(): BountyTemplate {
	return BOUNTY_TEMPLATES[Math.floor(Math.random() * BOUNTY_TEMPLATES.length)];
}

// ─── Core functions ───────────────────────────────────────────

/**
 * Create a new fake bounty issue in the repo.
 */
export async function createFakeBounty(repoId: string): Promise<{
	issueNumber: number;
	title: string;
} | null> {
	const [repo] = await db
		.select({
			fullName: repositories.fullName,
			orgId: repositories.orgId,
		})
		.from(repositories)
		.where(eq(repositories.id, repoId))
		.limit(1);
	if (!repo) return null;

	const [org] = await db
		.select({ installationId: organizations.githubInstallationId })
		.from(organizations)
		.where(eq(organizations.id, repo.orgId))
		.limit(1);
	if (!org) return null;

	const [config] = await db
		.select()
		.from(fakeBountyConfigs)
		.where(eq(fakeBountyConfigs.repoId, repoId))
		.limit(1);
	if (!config?.enabled) return null;

	// Check active count
	const [activeCount] = await db
		.select({ count: sql<number>`count(*)::int` })
		.from(fakeBounties)
		.where(
			and(
				eq(fakeBounties.repoId, repoId),
				eq(fakeBounties.status, "active"),
			),
		);
	if ((activeCount?.count ?? 0) >= config.maxActive) return null;

	const template = pickTemplate();
	const token = await getInstallationToken(org.installationId);
	const [owner, repoName] = repo.fullName.split("/");

	// Create the issue on GitHub
	const issue = await githubApi(`/repos/${owner}/${repoName}/issues`, token, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			title: template.title,
			body: template.body,
			labels: config.issueLabels,
		}),
	});

	if (!issue?.number) return null;

	// Record in DB
	await db.insert(fakeBounties).values({
		repoId,
		githubIssueNumber: issue.number,
		title: template.title,
		body: template.body,
	});

	await logEvent({
		repoId,
		action: "pipeline_logged",
		severity: "info",
		description: `Fake bounty issue #${issue.number} created: ${template.title}`,
		metadata: { fakeBounty: true, issueNumber: issue.number },
	});

	return { issueNumber: issue.number, title: template.title };
}

/**
 * Check if a PR or comment references a fake bounty issue.
 * Returns the matching bounty if found.
 */
export async function checkFakeBountyReference(
	repoId: string,
	contentText: string,
): Promise<{ bountyId: string; issueNumber: number } | null> {
	// Get all active fake bounties for this repo
	const bounties = await db
		.select()
		.from(fakeBounties)
		.where(
			and(
				eq(fakeBounties.repoId, repoId),
				eq(fakeBounties.status, "active"),
			),
		);

	if (bounties.length === 0) return null;

	// Check if content references any fake bounty issue number
	for (const bounty of bounties) {
		const patterns = [
			new RegExp(`#${bounty.githubIssueNumber}\\b`),
			new RegExp(`(?:fix|fixes|close|closes|resolve|resolves)\\s+#${bounty.githubIssueNumber}\\b`, "i"),
			new RegExp(`issue\\s+#?${bounty.githubIssueNumber}\\b`, "i"),
		];

		for (const pattern of patterns) {
			if (pattern.test(contentText)) {
				return { bountyId: bounty.id, issueNumber: bounty.githubIssueNumber };
			}
		}
	}

	return null;
}

/**
 * Handle a caught clanker submission to a fake bounty.
 * Sends decline message and records the catch.
 */
export async function handleFakeBountyCatch(opts: {
	repoId: string;
	bountyId: string;
	githubUsername: string;
	githubUserId?: number;
	githubRef: string;
	refType: "pr" | "comment" | "issue";
	prNumber?: number;
	installationId: number;
	repoFullName: string;
}): Promise<void> {
	const [config] = await db
		.select()
		.from(fakeBountyConfigs)
		.where(eq(fakeBountyConfigs.repoId, opts.repoId))
		.limit(1);
	if (!config) return;

	const token = await getInstallationToken(opts.installationId);
	const [owner, repoName] = opts.repoFullName.split("/");

	// Send decline message
	if (opts.prNumber) {
		await addComment(token, owner, repoName, opts.prNumber, config.declineMessage);
		// Close the PR
		await closePullRequest(token, owner, repoName, opts.prNumber);
	}

	// Record the catch
	await db.insert(fakeBountyCatches).values({
		bountyId: opts.bountyId,
		repoId: opts.repoId,
		githubUsername: opts.githubUsername,
		githubUserId: opts.githubUserId ?? null,
		githubRef: opts.githubRef,
		refType: opts.refType,
		declineSent: true,
	});

	// Increment catch count
	await db
		.update(fakeBounties)
		.set({
			catchCount: sql`${fakeBounties.catchCount} + 1`,
		})
		.where(eq(fakeBounties.id, opts.bountyId));

	await logEvent({
		repoId: opts.repoId,
		action: "pipeline_blocked",
		severity: "error",
		description: `Fake bounty trap caught @${opts.githubUsername} on ${opts.githubRef}`,
		targetGithubUsername: opts.githubUsername,
		targetGithubUserId: opts.githubUserId,
		githubRef: opts.githubRef,
		metadata: {
			fakeBounty: true,
			bountyId: opts.bountyId,
			refType: opts.refType,
		},
	});
}
