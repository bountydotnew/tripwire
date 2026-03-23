import { createFileRoute } from "@tanstack/react-router";
import { verifyWebhookSignature } from "#/lib/github/verify-webhook";
import {
	handlePullRequest,
	handleIssue,
	handleComment,
} from "#/lib/github/filter-pipeline";
import { db } from "#/db";
import { organizations, repositories, account } from "#/db/schema";
import { eq, and } from "drizzle-orm";

async function handler({ request }: { request: Request }) {
	console.log("[Webhook] ═══════════════════════════════════════");
	console.log("[Webhook] ▶ Received request at", new Date().toISOString());
	console.log("[Webhook] Method:", request.method);
	console.log("[Webhook] Headers:", Object.fromEntries(request.headers.entries()));

	const secret = process.env.GITHUB_WEBHOOK_SECRET;

	// Read body
	const body = await request.text();
	console.log("[Webhook] Body length:", body.length);

	// Verify signature if secret is configured
	if (secret) {
		const signature = request.headers.get("x-hub-signature-256");
		console.log("[Webhook] Signature header:", signature);
		console.log("[Webhook] Secret (first 8 chars):", secret.substring(0, 8) + "...");
		console.log("[Webhook] Verifying signature...");
		const valid = await verifyWebhookSignature(body, signature, secret);
		if (!valid) {
			console.log("[Webhook] ✗ Invalid signature - returning 401");
			return new Response("Invalid signature", { status: 401 });
		}
		console.log("[Webhook] ✓ Signature valid");
	} else {
		console.log("[Webhook] ⚠ No webhook secret configured, skipping verification");
	}

	const event = request.headers.get("x-github-event");
	const payload = JSON.parse(body);

	console.log("[Webhook] Event:", event, "| Action:", payload.action);

	const installationId = payload.installation?.id;
	if (!installationId) {
		console.log("[Webhook] No installation ID in payload, ignoring");
		return new Response("No installation", { status: 200 });
	}
	console.log("[Webhook] Installation ID:", installationId);

	// Handle installation events (app install/uninstall)
	if (event === "installation") {
		console.log("[Webhook] Processing installation event...");
		try {
			await handleInstallation(payload);
			console.log("[Webhook] ✓ Installation event processed");
		} catch (err) {
			console.error("[Webhook] ✗ Installation handler error:", err);
		}
		return new Response("OK", { status: 200 });
	}

	// Handle repos added/removed from existing installation
	if (event === "installation_repositories") {
		console.log("[Webhook] Processing installation_repositories event...");
		try {
			await handleInstallationRepositories(payload);
			console.log("[Webhook] ✓ installation_repositories event processed");
		} catch (err) {
			console.error("[Webhook] ✗ installation_repositories handler error:", err);
		}
		return new Response("OK", { status: 200 });
	}

	// Build context for filter pipeline
	const repo = payload.repository;
	if (!repo) return new Response("OK", { status: 200 });

	const ctx = {
		installationId,
		repoFullName: repo.full_name,
		githubRepoId: repo.id,
		senderLogin: payload.sender?.login ?? "",
		senderId: payload.sender?.id ?? 0,
	};

	try {
		switch (event) {
			case "pull_request": {
				if (payload.action === "opened" || payload.action === "reopened") {
					await handlePullRequest(
						ctx,
						payload.pull_request.number,
						payload.pull_request.title,
						payload.pull_request.body ?? undefined,
					);
				}
				break;
			}

			case "issues": {
				if (payload.action === "opened" || payload.action === "reopened") {
					await handleIssue(
						ctx,
						payload.issue.number,
						payload.issue.title,
						payload.issue.body ?? undefined,
					);
				}
				break;
			}

			case "issue_comment": {
				// Skip comments from bots (including our own)
				if (payload.sender?.type === "Bot") {
					console.log("[Webhook] Skipping bot comment from", payload.sender.login);
					break;
				}
				if (payload.action === "created") {
					await handleComment(
						ctx,
						payload.comment.id,
						payload.issue.number,
						payload.comment.body ?? undefined,
					);
				}
				break;
			}
		}
	} catch (err) {
		console.error("Webhook handler error:", err);
	}

	return new Response("OK", { status: 200 });
}

/**
 * Handle GitHub App installation/uninstallation.
 * Creates or removes org + repo records.
 */
async function handleInstallation(payload: {
	action: string;
	installation: {
		id: number;
		account: {
			id: number;
			login: string;
			type: string;
			avatar_url: string;
		};
	};
	repositories?: Array<{
		id: number;
		name: string;
		full_name: string;
		private: boolean;
	}>;
	sender: { id: number; login: string };
}) {
	if (payload.action === "created") {
		const { installation } = payload;
		console.log("[Install] Action: created");
		console.log("[Install] Sender:", payload.sender.login, "(ID:", payload.sender.id, ")");
		console.log("[Install] Account:", installation.account.login, "(ID:", installation.account.id, ")");
		console.log("[Install] Repos in payload:", payload.repositories?.length ?? 0);

		// Find the Tripwire user by matching the sender's GitHub ID
		// to the Better Auth `account` table (provider = "github")
		console.log("[Install] Looking up sender in account table...");
		const allAccounts = await db.select().from(account);
		console.log("[Install] All accounts in DB:", allAccounts.map(a => ({ provider: a.providerId, accountId: a.accountId, userId: a.userId })));

		const [senderAccount] = await db
			.select()
			.from(account)
			.where(
				and(
					eq(account.providerId, "github"),
					eq(account.accountId, String(payload.sender.id)),
				),
			);

		if (!senderAccount) {
			console.log(
				`[Install] ✗ No matching account for GitHub user ${payload.sender.login} (${payload.sender.id}). They need to sign up first.`,
			);
			return;
		}
		console.log("[Install] ✓ Found account, userId:", senderAccount.userId);

		const ownerId = senderAccount.userId;

		// Upsert the Tripwire org
		const existingOrgs = await db
			.select()
			.from(organizations)
			.where(eq(organizations.githubInstallationId, installation.id));

		console.log("[Install] Existing orgs for this installation:", existingOrgs.length);

		let org;
		if (existingOrgs.length === 0) {
			console.log("[Install] Creating new org...");
			const [newOrg] = await db
				.insert(organizations)
				.values({
					githubInstallationId: installation.id,
					githubAccountId: installation.account.id,
					githubAccountLogin: installation.account.login,
					githubAccountType: installation.account.type,
					avatarUrl: installation.account.avatar_url,
					ownerId,
				})
				.returning();
			org = newOrg;
			console.log(
				`[Install] ✓ Created org "${installation.account.login}" (ID: ${org.id}), owned by user ${ownerId}`,
			);
		} else {
			org = existingOrgs[0];
			console.log("[Install] Org already exists, ID:", org.id);
			// Update owner if not set
			if (!org.ownerId || org.ownerId !== ownerId) {
				await db
					.update(organizations)
					.set({ ownerId, updatedAt: new Date() })
					.where(eq(organizations.id, org.id));
				console.log("[Install] Updated org owner to", ownerId);
			}
		}

		// Add repos
		if (payload.repositories && org) {
			console.log("[Install] Adding", payload.repositories.length, "repos...");
			for (const repo of payload.repositories) {
				const existing = await db
					.select()
					.from(repositories)
					.where(eq(repositories.githubRepoId, repo.id));

				if (existing.length === 0) {
					await db.insert(repositories).values({
						orgId: org.id,
						githubRepoId: repo.id,
						name: repo.name,
						fullName: repo.full_name,
						isPrivate: repo.private,
					});
					console.log("[Install] ✓ Added repo:", repo.full_name);
				} else {
					console.log("[Install] Repo already exists:", repo.full_name);
				}
			}
		}
		console.log("[Install] ✓ Installation complete");
	}

	if (payload.action === "deleted") {
		console.log("[Install] Action: deleted, installation:", payload.installation.id);
		// Remove the org (cascades to repos, configs, lists, events)
		await db
			.delete(organizations)
			.where(
				eq(
					organizations.githubInstallationId,
					payload.installation.id,
				),
			);
		console.log("[Install] ✓ Deleted org");
	}
}

/**
 * Handle repos added/removed from an existing GitHub App installation.
 */
async function handleInstallationRepositories(payload: {
	action: "added" | "removed";
	installation: { id: number };
	repositories_added?: Array<{
		id: number;
		name: string;
		full_name: string;
		private: boolean;
	}>;
	repositories_removed?: Array<{ id: number }>;
}) {
	console.log("[RepoChange] Action:", payload.action);
	console.log("[RepoChange] Installation ID:", payload.installation.id);

	// Find the Tripwire org for this installation
	const [org] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.githubInstallationId, payload.installation.id));

	if (!org) {
		console.log(
			`[RepoChange] ✗ No org found for installation ${payload.installation.id}`,
		);
		return;
	}
	console.log("[RepoChange] Found org:", org.githubAccountLogin, "(ID:", org.id, ")");

	if (payload.action === "added" && payload.repositories_added) {
		console.log("[RepoChange] Adding", payload.repositories_added.length, "repos...");
		for (const repo of payload.repositories_added) {
			const existing = await db
				.select()
				.from(repositories)
				.where(eq(repositories.githubRepoId, repo.id));

			if (existing.length === 0) {
				await db.insert(repositories).values({
					orgId: org.id,
					githubRepoId: repo.id,
					name: repo.name,
					fullName: repo.full_name,
					isPrivate: repo.private,
				});
				console.log(`[RepoChange] ✓ Added repo ${repo.full_name}`);
			} else {
				console.log(`[RepoChange] Repo already exists: ${repo.full_name}`);
			}
		}
	}

	if (payload.action === "removed" && payload.repositories_removed) {
		console.log("[RepoChange] Removing", payload.repositories_removed.length, "repos...");
		for (const repo of payload.repositories_removed) {
			await db
				.delete(repositories)
				.where(eq(repositories.githubRepoId, repo.id));
			console.log(`[RepoChange] ✓ Removed repo ${repo.id}`);
		}
	}
}

export const Route = createFileRoute("/api/github/webhook")({
	server: {
		handlers: {
			POST: handler,
		},
	},
});
