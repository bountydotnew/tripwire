import { createFileRoute } from "@tanstack/react-router";
import { createContext } from "#/integrations/trpc/init";
import { db } from "#/db";
import { organizations, repositories, account } from "#/db/schema";
import { eq, and } from "drizzle-orm";
import { getInstallationToken } from "#/lib/github/github-api";

/**
 * GitHub App post-installation callback.
 * GitHub redirects here after a user installs/updates the app.
 *
 * Also creates the org/repo records if the webhook hasn't arrived yet
 * (common in local dev where GitHub can't reach localhost).
 */
async function handler({ request }: { request: Request }) {
	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const setupAction = url.searchParams.get("setup_action");

	console.log("[Callback] ▶ GitHub App callback received");
	console.log("[Callback] Installation ID:", installationId);
	console.log("[Callback] Setup action:", setupAction);

	if (installationId && setupAction === "install") {
		try {
			const ctx = await createContext({ headers: request.headers });
			if (ctx.user) {
				await ensureInstallation(Number(installationId), ctx.user.id);
			}
		} catch (err) {
			console.error("[Callback] Failed to ensure installation:", err);
		}
	}

	return new Response(null, {
		status: 302,
		headers: { Location: "/rules" },
	});
}

/**
 * Ensure the org + repos exist for this installation.
 * Idempotent — skips if already set up by the webhook.
 */
async function ensureInstallation(installationId: number, userId: string) {
	// Check if org already exists
	const [existing] = await db
		.select()
		.from(organizations)
		.where(eq(organizations.githubInstallationId, installationId));

	if (existing) {
		console.log("[Callback] Org already exists for installation", installationId);
		return;
	}

	// Fetch repos for this installation (also gives us the account/owner info)
	const token = await getInstallationToken(installationId);
	const reposRes = await fetch(
		"https://api.github.com/installation/repositories?per_page=100",
		{
			headers: {
				Authorization: `token ${token}`,
				Accept: "application/vnd.github.v3+json",
			},
		},
	);

	if (!reposRes.ok) {
		console.error("[Callback] Failed to fetch repos:", reposRes.status);
		return;
	}

	const { repositories: repos } = await reposRes.json();
	if (!repos || repos.length === 0) {
		console.log("[Callback] No repos found for installation");
		return;
	}

	// Extract account info from the first repo's owner
	const ghAccount = repos[0].owner;

	// Create org
	const [org] = await db
		.insert(organizations)
		.values({
			githubInstallationId: installationId,
			githubAccountId: ghAccount.id,
			githubAccountLogin: ghAccount.login,
			githubAccountType: ghAccount.type ?? "User",
			avatarUrl: ghAccount.avatar_url,
			ownerId: userId,
		})
		.returning();

	console.log(`[Callback] Created org "${ghAccount.login}" (ID: ${org.id})`);

	// Add repos
	for (const repo of repos) {
		const [existingRepo] = await db
			.select()
			.from(repositories)
			.where(eq(repositories.githubRepoId, repo.id));

		if (!existingRepo) {
			await db.insert(repositories).values({
				orgId: org.id,
				githubRepoId: repo.id,
				name: repo.name,
				fullName: repo.full_name,
				isPrivate: repo.private,
			});
			console.log(`[Callback] Added repo: ${repo.full_name}`);
		}
	}
}

export const Route = createFileRoute("/api/github/callback")({
	server: {
		handlers: {
			GET: handler,
		},
	},
});
