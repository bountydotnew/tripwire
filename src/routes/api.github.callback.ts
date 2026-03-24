import { createFileRoute } from "@tanstack/react-router";

/**
 * GitHub App post-installation callback.
 * GitHub redirects here after a user installs/updates the app.
 *
 * Query params from GitHub:
 * - installation_id: The installation ID
 * - setup_action: "install" | "update" | "request"
 */
async function handler({ request }: { request: Request }) {
	const url = new URL(request.url);
	const installationId = url.searchParams.get("installation_id");
	const setupAction = url.searchParams.get("setup_action");

	console.log("[Callback] ▶ GitHub App callback received");
	console.log("[Callback] Installation ID:", installationId);
	console.log("[Callback] Setup action:", setupAction);
	console.log("[Callback] Full URL:", request.url);

	// Redirect to the rules page after installation
	// The webhook will have already created the org/repos by now
	console.log("[Callback] Redirecting to /rules");
	return new Response(null, {
		status: 302,
		headers: {
			Location: "/rules",
		},
	});
}

export const Route = createFileRoute("/api/github/callback")({
	server: {
		handlers: {
			GET: handler,
		},
	},
});
