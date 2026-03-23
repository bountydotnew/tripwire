import { z } from "zod";
import { eq } from "drizzle-orm";
import { authedProcedure } from "../init";
import { db } from "#/db";
import { organizations, repositories } from "#/db/schema";

import type { TRPCRouterRecord } from "@trpc/server";

export const orgsRouter = {
	/** List all Tripwire orgs (GitHub installations) for a user */
	list: authedProcedure
		.input(z.object({ userId: z.string() }))
		.query(async ({ input }) => {
			return db
				.select()
				.from(organizations)
				.where(eq(organizations.ownerId, input.userId));
		}),

	/** Get a single org by ID */
	get: authedProcedure
		.input(z.object({ orgId: z.string().uuid() }))
		.query(async ({ input }) => {
			const [org] = await db
				.select()
				.from(organizations)
				.where(eq(organizations.id, input.orgId));
			return org ?? null;
		}),

	/** List repos for an org */
	repos: authedProcedure
		.input(z.object({ orgId: z.string().uuid() }))
		.query(async ({ input }) => {
			return db
				.select()
				.from(repositories)
				.where(eq(repositories.orgId, input.orgId));
		}),

	/** List all repos across all orgs for a user (for MVP single-user flow) */
	myRepos: authedProcedure
		.input(z.object({ userId: z.string() }))
		.query(async ({ input }) => {
			const orgs = await db
				.select()
				.from(organizations)
				.where(eq(organizations.ownerId, input.userId));

			if (orgs.length === 0) return [];

			const allRepos = [];
			for (const org of orgs) {
				const repos = await db
					.select()
					.from(repositories)
					.where(eq(repositories.orgId, org.id));
				allRepos.push(
					...repos.map((r) => ({
						...r,
						orgName: org.githubAccountLogin,
						installationId: org.githubInstallationId,
					})),
				);
			}
			return allRepos;
		}),
} satisfies TRPCRouterRecord;
