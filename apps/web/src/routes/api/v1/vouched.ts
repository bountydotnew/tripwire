import { createFileRoute } from "@tanstack/react-router";
import { desc, sql } from "drizzle-orm";
import { db } from "@tripwire/db/client";
import { globalVouches } from "@tripwire/db";
import { verifyApiKey, hasScope } from "@tripwire/core";

async function handler({ request }: { request: Request }) {
	// Verify API key from Authorization header
	const authHeader = request.headers.get("authorization");
	const apiKey = authHeader?.startsWith("Bearer ")
		? authHeader.slice(7)
		: null;

	if (!apiKey) {
		return Response.json(
			{ error: "Missing API key. Get it from https://tripwire.sh/settings/developers" },
			{ status: 401 },
		);
	}

	const keyData = await verifyApiKey(apiKey);
	if (!keyData) {
		return Response.json(
			{ error: "Invalid or expired API key." },
			{ status: 401 },
		);
	}

	if (!hasScope(keyData.scopes, "vouches:read")) {
		return Response.json(
			{ error: "API key does not have the vouches:read scope." },
			{ status: 403 },
		);
	}

	// Parse query params
	const url = new URL(request.url);
	const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100", 10), 500);
	const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
	const search = url.searchParams.get("search") ?? undefined;

	const conditions = [];
	if (search) {
		conditions.push(
			sql`lower(${globalVouches.githubUsername}) like ${`%${search.toLowerCase()}%`}`,
		);
	}
	const whereClause = conditions.length > 0
		? sql`${sql.join(conditions, sql` and `)}`
		: undefined;

	const [users, countResult] = await Promise.all([
		db
			.select({
				githubUsername: globalVouches.githubUsername,
				githubUserId: globalVouches.githubUserId,
				avatarUrl: globalVouches.avatarUrl,
				vouchCount: sql<number>`count(*)::int`,
				firstVouchedAt: sql<string>`min(${globalVouches.createdAt})`,
				lastVouchedAt: sql<string>`max(${globalVouches.createdAt})`,
			})
			.from(globalVouches)
			.where(whereClause)
			.groupBy(
				globalVouches.githubUsername,
				globalVouches.githubUserId,
				globalVouches.avatarUrl,
			)
			.orderBy(desc(sql`count(*)`))
			.limit(limit)
			.offset(offset),
		db
			.select({
				count: sql<number>`count(distinct lower(${globalVouches.githubUsername}))::int`,
			})
			.from(globalVouches)
			.where(whereClause),
	]);

	return Response.json({
		data: users,
		total: countResult[0]?.count ?? 0,
		limit,
		offset,
	}, {
		headers: {
			"Cache-Control": "public, max-age=60",
			"Access-Control-Allow-Origin": "*",
		},
	});
}

export const Route = createFileRoute("/api/v1/vouched")({
	server: {
		handlers: {
			GET: handler,
		},
	},
});
