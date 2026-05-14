import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "#/integrations/trpc/react";

export const Route = createFileRoute("/vouched")({
	component: VouchedUsersPage,
});

function VouchedUsersPage() {
	const trpc = useTRPC();
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(0);
	const limit = 50;

	const vouchQuery = useQuery({
		...trpc.vouches.list.queryOptions({
			limit,
			offset: page * limit,
			search: search || undefined,
		}),
	});

	const users = vouchQuery.data?.users ?? [];
	const total = vouchQuery.data?.total ?? 0;
	const totalPages = Math.ceil(total / limit);

	return (
		<div className="min-h-screen w-full bg-[#191919] text-white">
			<div className="max-w-3xl mx-auto px-4 py-12">
				<header className="flex flex-col gap-2 mb-8">
					<h1 className="text-[28px] font-semibold tracking-[-0.02em] m-0">
						Vouched Contributors
					</h1>
					<p className="text-[14px] text-[#FFFFFF99] m-0 max-w-lg">
						GitHub users vouched for by Tripwire maintainers. Vouched users
						can be auto-trusted across repositories that opt in.
					</p>
				</header>

				{/* Search */}
				<div className="mb-6">
					<input
						type="text"
						value={search}
						onChange={(e) => {
							setSearch(e.target.value);
							setPage(0);
						}}
						placeholder="Search by GitHub username..."
						className="w-full max-w-sm rounded-lg bg-tw-surface border border-tw-border text-[13px] text-tw-text-primary p-2.5 outline-none focus:border-tw-accent transition-colors"
					/>
				</div>

				{/* Stats */}
				<div className="flex items-center gap-4 mb-4 text-[12px] text-tw-text-tertiary">
					<span>{total} vouched user{total !== 1 ? "s" : ""}</span>
				</div>

				{/* Table */}
				{vouchQuery.isPending ? (
					<div className="flex items-center justify-center py-12">
						<div className="w-5 h-5 border-2 border-tw-text-tertiary border-t-tw-accent rounded-full animate-spin" />
					</div>
				) : users.length === 0 ? (
					<div className="text-center py-12 text-tw-text-tertiary text-[14px]">
						{search ? "No matching users found." : "No vouched users yet."}
					</div>
				) : (
					<div className="flex flex-col gap-[2px] rounded-xl overflow-hidden">
						{users.map((user) => (
							<div
								key={user.githubUsername}
								className="flex items-center gap-3 px-4 py-3 bg-tw-card hover:bg-tw-hover transition-colors"
							>
								<img
									src={
										user.avatarUrl ||
										`https://github.com/${user.githubUsername}.png`
									}
									alt=""
									className="w-9 h-9 rounded-full shrink-0"
								/>
								<div className="flex-1 min-w-0">
									<a
										href={`https://github.com/${user.githubUsername}`}
										target="_blank"
										rel="noopener noreferrer"
										className="text-[14px] text-tw-text-primary hover:text-tw-accent transition-colors font-medium"
									>
										@{user.githubUsername}
									</a>
									<div className="text-[11px] text-tw-text-tertiary">
										{user.vouchCount} vouch{user.vouchCount !== 1 ? "es" : ""}
									</div>
								</div>
								<div className="text-[11px] text-tw-text-tertiary text-right shrink-0">
									First vouched
									<br />
									{new Date(user.firstVouchedAt).toLocaleDateString()}
								</div>
							</div>
						))}
					</div>
				)}

				{/* Pagination */}
				{totalPages > 1 && (
					<div className="flex items-center justify-center gap-2 mt-6">
						<button
							type="button"
							onClick={() => setPage((p) => Math.max(0, p - 1))}
							disabled={page === 0}
							className="px-3 py-1.5 rounded-md text-[12px] bg-tw-card text-tw-text-secondary hover:bg-tw-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							Previous
						</button>
						<span className="text-[12px] text-tw-text-tertiary">
							Page {page + 1} of {totalPages}
						</span>
						<button
							type="button"
							onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
							disabled={page >= totalPages - 1}
							className="px-3 py-1.5 rounded-md text-[12px] bg-tw-card text-tw-text-secondary hover:bg-tw-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
						>
							Next
						</button>
					</div>
				)}
			</div>
		</div>
	);
}
